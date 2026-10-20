const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { buildSeed } = require('./backend/seed.cjs');
const root = path.resolve(__dirname, '..');
function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new vm.Script(code,{filename:file}).runInNewContext({exports,Request,Response,Headers,URL,TextEncoder,AbortSignal,AbortController,setTimeout,clearTimeout,console,crypto:require('node:crypto').webcrypto,...globals,require(name){
    assert.ok(Object.hasOwn(imports,name),'Unexpected import '+name);return imports[name];
  }});
  return exports;
}
const schedule = load('src/utils/showSchedule.ts');
const types = load('src/types/notifications.ts');
const { notificationOpenAction } = load('src/utils/notificationOpen.ts',{'@/utils/showSchedule':schedule});
const { createPushDeviceHandler } = load('supabase/functions/push-device/handler.ts');
const { createPushDispatchHandler } = load('supabase/functions/push-dispatch/handler.ts');
const now = '2026-10-19T15:55:00Z'; // Monday, 17:55 SAST.
const start = '2026-10-19T16:00:00Z';
const end = '2026-10-19T19:00:00Z';
const reminder = {version:1,kind:'show-reminder',showId:'restart',startsAt:start,endsAt:end};
const show = {id:'restart',title:'The Restart',schedules:[{day:1,start:'18:00',end:'21:00',validFrom:null,validUntil:null}]};
let db;
const uid = '20000000-0000-4000-8000-000000000001';
before(async()=>{
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
    create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users on delete cascade,status text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    grant select on storage.buckets to anon,authenticated,service_role;`);
  for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  await db.exec(buildSeed());
  await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[uid]);
});
after(async()=>await db?.close());
async function rpc(name,args=[]){ return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result; }
function registration(overrides={}){
  const device=randomUUID();
  return {id:device,hash:'a'.repeat(64),seq:1,token:`ExpoPushToken[${device.replaceAll('-','')}]`,platform:'android',env:'preview',user:null,enabled:true,
    prefs:{enabled:true,scope:'favorites',leadMinutes:5},favorites:['restart'],oneTime:[],...overrides};
}
const register=d=>rpc('push_register_device',[d.id,d.hash,d.seq,d.token,d.platform,d.env,d.user,d.enabled,JSON.stringify(d.prefs),d.favorites,JSON.stringify(d.oneTime)]);
const candidates=()=>db.query('select * from public.push_due_candidates($1)',[now]).then(r=>r.rows);
const claim=(allowed,at=now)=>rpc('push_claim_jobs',['preview',allowed,at]);

test('guest subscriptions use phone favourites and never silently subscribe a preview preference',async()=>{
  const d=registration(); await register(d);
  assert.ok((await candidates()).some(c=>c.device_id===d.id&&c.show_id==='restart'));
  const off=registration({enabled:false});await register(off);
  assert.ok(!(await candidates()).some(c=>c.device_id===off.id));
  const none=registration({favorites:[]});await register(none);
  assert.ok(!(await candidates()).some(c=>c.device_id===none.id));
  const all=registration({prefs:{enabled:true,scope:'all',leadMinutes:5},favorites:[]});await register(all);
  assert.ok((await candidates()).some(c=>c.device_id===all.id&&c.show_id==='restart'));
});
test('device secrets, token ownership and sequence numbers reject hijacking and stale updates',async()=>{
  const d=registration();await register(d);
  await assert.rejects(register({...d,seq:2,hash:'b'.repeat(64)}),/authentication/);
  await assert.rejects(register(registration({token:d.token})),/another installation/);
  await register({...d,seq:3,enabled:false});
  assert.equal((await register({...d,seq:2})).saved,false);
  assert.ok(!(await candidates()).some(c=>c.device_id===d.id));
});
test('signed-in recipients use current account favourites/settings, not a stale client snapshot',async()=>{
  await db.query('update public.user_settings set notifications_enabled=true,reminder_scope=$2,reminder_lead_minutes=5 where user_id=$1',[uid,'favorites']);
  await db.query("insert into public.user_favorites(user_id,show_id) values($1,'restart') on conflict(user_id,show_id) do update set is_favorite=true",[uid]);
  const d=registration({user:uid,favorites:[],prefs:{enabled:false,scope:'all',leadMinutes:0}});await register(d);
  assert.ok((await candidates()).some(c=>c.device_id===d.id));
  await db.query("update public.user_favorites set is_favorite=false where user_id=$1 and show_id='restart'",[uid]);
  assert.ok(!(await candidates()).some(c=>c.device_id===d.id));
  await db.query('update public.user_settings set reminder_scope=$2 where user_id=$1',[uid,'all']);
  assert.ok((await candidates()).some(c=>c.device_id===d.id));
  await db.query('update public.user_settings set notifications_enabled=false where user_id=$1',[uid]);
  assert.ok(!(await candidates()).some(c=>c.device_id===d.id));
});
test('one-time and global reminders merge into one occurrence; expired jobs are not sent late',async()=>{
  // Store a future one-time occurrence relative to the database clock, then
  // exercise the scheduler at that occurrence's actual due time.
  const day=new Date(); day.setUTCDate(day.getUTCDate()+((8-day.getUTCDay())%7||7));
  day.setUTCHours(16,0,0,0);const future=day.toISOString();
  const d=registration({oneTime:[{showId:'restart',startsAt:future,leadMinutes:5}]});await register(d);
  const due=new Date(day.getTime()-5*60000).toISOString();
  const jobs=await claim([d.id],due);
  assert.equal(jobs.length,1);assert.equal(jobs[0].showId,'restart');
  assert.equal((await claim([d.id],due)).length,0,'A second worker must not claim the leased job');
  await rpc('push_finish_job',[jobs[0].id,jobs[0].lease,'sent','ticket-1',null]);
  assert.equal((await claim([d.id],due)).length,0,'Already accepted sends must not replay');
  assert.equal((await claim([d.id],new Date(day.getTime()+600000).toISOString())).length,0);
});
test('schedule edits and draft shows cancel queued retries before another send',async()=>{
  const d=registration();await register(d);const jobs=await claim([d.id]);assert.equal(jobs.length,1);
  await rpc('push_finish_job',[jobs[0].id,jobs[0].lease,'retry',null,'http_503']);
  await db.exec("update public.shows set status='draft' where id='restart'");
  assert.equal((await claim([d.id])).length,0);
  assert.equal((await db.query('select state from app_private.push_jobs where id=$1',[jobs[0].id])).rows[0].state,'cancelled');
  await db.exec("update public.shows set status='published' where id='restart'");
});
test('overlapping workers, internal allowlists and preview/production audience isolation',async()=>{
  const a=registration(),b=registration({env:'production'});await register(a);await register(b);
  assert.equal((await claim([])).length,0,'An empty allowlist must send nothing');
  const first=await claim([a.id,b.id]);assert.equal(first.length,1);assert.equal(first[0].token,a.token);
  assert.equal((await claim([a.id])).length,0);
});
test('expired leases become uncertain instead of creating duplicate sends; wrong leases cannot acknowledge',async()=>{
  const d=registration();await register(d);const [job]=await claim([d.id]);
  await rpc('push_finish_job',[job.id,randomUUID(),'sent','wrong',null]);
  assert.equal((await db.query('select state from app_private.push_jobs where id=$1',[job.id])).rows[0].state,'leased');
  await db.query('update app_private.push_jobs set lease_until=$2 where id=$1',[job.id,'2020-01-01']);
  await claim([d.id]);
  assert.equal((await db.query('select state from app_private.push_jobs where id=$1',[job.id])).rows[0].state,'uncertain');
});
test('unregistered-token receipts disable only that token, not a freshly rotated token',async()=>{
  const d=registration();await register(d);const [job]=await claim([d.id]);
  await rpc('push_finish_job',[job.id,job.lease,'sent','receipt-token',null]);
  await register({...d,seq:2,token:'ExpoPushToken[rotated_1234567890]'});
  await rpc('push_finish_receipt',[job.id,'error','DeviceNotRegistered']);
  assert.equal((await db.query('select enabled from app_private.push_devices where id=$1',[d.id])).rows[0].enabled,true);
  const other=registration();await register(other);const [old]=await claim([other.id]);
  await rpc('push_finish_job',[old.id,old.lease,'failed',null,'DeviceNotRegistered']);
  assert.equal((await db.query('select enabled from app_private.push_devices where id=$1',[other.id])).rows[0].enabled,false);
});
test('anon and authenticated clients cannot read tokens/jobs or execute sender/registration RPCs',async()=>{
  for(const role of ['anon','authenticated']){
    await db.exec('set role '+role);
    try{
      await assert.rejects(db.query('select * from app_private.push_devices'),/permission denied/);
      await assert.rejects(rpc('push_claim_jobs',['preview',null,now]),/permission denied/);
      await assert.rejects(rpc('push_pending_receipts'),/permission denied/);
      await assert.rejects(rpc('push_hit_limit',['test',1,60]),/permission denied/);
    }finally{await db.exec('reset role');}
  }
});
test('account deletion cascades private device registrations and queued deliveries',async()=>{
  const other=randomUUID();await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[other]);
  const d=registration({user:other});await register(d);
  await db.query('delete from auth.users where id=$1',[other]);
  assert.equal((await db.query('select count(*)::int as n from app_private.push_devices where id=$1',[d.id])).rows[0].n,0);
});
test('a favourite gets one independent live alert five minutes after start, even after its first reminder was sent',async()=>{
 const d=registration();await register(d);
 const [first]=await claim([d.id]);assert.equal(first.phase,'reminder');await rpc('push_finish_job',[first.id,first.lease,'sent','first-ticket',null]);
 assert.equal((await claim([d.id],'2026-10-19T16:04:59Z')).length,0);
 const [live]=await claim([d.id],'2026-10-19T16:05:00Z');assert.equal(live.phase,'live');assert.notEqual(live.id,first.id);assert.equal(live.showId,'restart');
 assert.equal((await claim([d.id],'2026-10-19T16:05:30Z')).length,0);
 await rpc('push_finish_job',[live.id,live.lease,'sent','live-ticket',null]);
 assert.equal((await claim([d.id],'2026-10-19T16:06:00Z')).length,0);
 assert.equal((await claim([d.id],'2026-10-19T16:07:00Z')).length,0);
});
test('live alerts honour current favourites, opt-out and environment; every-show and one-time choices alone do not subscribe extra alerts',async()=>{
 const at='2026-10-19T16:05:00Z';
 for(const overrides of [{favorites:[]},{enabled:false},{env:'production'},{favorites:[],prefs:{enabled:true,scope:'all',leadMinutes:5}},{prefs:{enabled:false,scope:'favorites',leadMinutes:5}}]){
  const d=registration(overrides);await register(d);assert.equal((await claim([d.id],at)).length,0);
 }
 const d=registration();await register(d);const [job]=await claim([d.id],at);assert.equal(job.phase,'live');
 await rpc('push_finish_job',[job.id,job.lease,'retry',null,'http_503']);
 await register({...d,seq:2,favorites:[]});assert.equal((await claim([d.id],at)).length,0);
 assert.equal((await db.query('select state from app_private.push_jobs where id=$1',[job.id])).rows[0].state,'cancelled');
});
test('signed-in live alerts use account favourites and skip shows that have ended or become drafts',async()=>{
 await db.query("update public.user_settings set notifications_enabled=true,reminder_scope='all' where user_id=$1",[uid]);
 await db.query("update public.user_favorites set is_favorite=true where user_id=$1 and show_id='restart'",[uid]);
 const d=registration({user:uid,favorites:[]});await register(d);
 const at='2026-10-19T16:05:00Z';assert.equal((await claim([d.id],at)).length,1);
 const other=registration();await register(other);
 await db.exec("update public.shows set status='draft' where id='restart'");assert.equal((await claim([other.id],at)).length,0);
 await db.exec("update public.shows set status='published' where id='restart'");
 await db.exec("update public.show_schedules set ends_at='18:04' where show_id='restart' and day_of_week=1");assert.equal((await claim([other.id],at)).length,0);
 await db.exec("update public.show_schedules set ends_at='21:00' where show_id='restart' and day_of_week=1");
});
test('the new candidate RPC remains inaccessible to ordinary app roles',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{await assert.rejects(rpc('push_delivery_candidates',[now]),/permission denied/);}finally{await db.exec('reset role');}}
});
test('the live alert follows overnight slots and their effective date on the starting SAST day',async()=>{
 const d=registration();await register(d);
 await db.exec("update public.show_schedules set starts_at='23:58',ends_at='00:30',valid_from='2026-10-19',valid_until='2026-10-19' where show_id='restart' and day_of_week=1");
 try{
  const [job]=await claim([d.id],'2026-10-19T22:03:00Z');assert.equal(job.phase,'live');assert.equal(Date.parse(job.startsAt),Date.parse('2026-10-19T21:58:00Z'));
  assert.equal((await claim([d.id],'2026-10-26T22:03:00Z')).length,0);
 }finally{await db.exec("update public.show_schedules set starts_at='18:00',ends_at='21:00',valid_from=null,valid_until=null where show_id='restart' and day_of_week=1");}
});
test('the upgrade preserves existing delivery IDs and states while assigning their original reminder phase',async()=>{
 await db.exec('begin');
 try{
  await db.exec(`delete from app_private.push_jobs where phase='live';
    alter table app_private.push_jobs drop column phase;
    alter table app_private.push_jobs add unique(device_id,show_id,starts_at);
    drop function public.push_delivery_candidates(timestamptz);`);
  const d=registration();await register(d);
  const id=randomUUID();await db.query("insert into app_private.push_jobs(id,device_id,show_id,starts_at,ends_at,expires_at,state,ticket) values($1,$2,'restart',$3,$4,$4,'sent','preserved-ticket')",[id,d.id,start,end]);
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261020130000_favorite_live_reminders.sql'),'utf8'));
  const row=(await db.query('select id,state,ticket,phase from app_private.push_jobs where id=$1',[id])).rows[0];assert.deepEqual(row,{id,state:'sent',ticket:'preserved-ticket',phase:'reminder'});
 }finally{await db.exec('rollback');}
});
test('extended account settings preserve legacy boolean writes and retry-safe revision semantics',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const get=()=>rpc('get_account_data');const apply=changes=>rpc('apply_account_changes',[JSON.stringify(changes)]);
  let account=await get();
  const change={id:randomUUID(),kind:'settings',value:true,scope:'all',leadMinutes:15,base_revision:account.settings.revision};
  const saved=await apply([change]);assert.equal(saved.account.settings.reminder_scope,'all');assert.equal(saved.account.settings.reminder_lead_minutes,15);
  await apply([{...change,scope:'favorites',leadMinutes:0}]);
  account=await get();assert.equal(account.settings.reminder_scope,'all','Replaying an operation ID cannot replace its choices');
  const legacy={id:randomUUID(),kind:'settings',value:false,base_revision:account.settings.revision};
  const result=await apply([legacy]);assert.equal(result.account.settings.reminder_scope,'all');assert.equal(result.account.settings.reminder_lead_minutes,15);
  await assert.rejects(apply([{id:randomUUID(),kind:'settings',value:true,scope:'invalid',base_revision:result.account.settings.revision}]),/Invalid reminder/);
});

test('notification payloads accept only typed show reminders and valid bounded dates',()=>{
  assert.equal(types.parseShowReminder(reminder).showId,'restart');
  for(const bad of [null,{}, {...reminder,kind:'url',url:'https://evil.test'}, {...reminder,showId:'../account'}, {...reminder,endsAt:start}, {...reminder,startsAt:'tomorrow'}]) assert.equal(types.parseShowReminder(bad),null);
});
test('notification tap plays the named on-air show, opens early reminders with current live audio, and never autoplays expired/changed shows',()=>{
  let action=notificationOpenAction(reminder,[show],Date.parse(start)+1000);assert.equal(action.play,true);assert.equal(action.preferredShow,'restart');
  action=notificationOpenAction(reminder,[show],Date.parse(now));assert.equal(action.play,true);assert.equal(action.preferredShow,undefined);assert.match(action.message,/current live broadcast/);
  assert.equal(notificationOpenAction(reminder,[show],Date.parse(end)).play,false);
  assert.equal(notificationOpenAction(reminder,[],Date.parse(start)).play,false);
  assert.equal(notificationOpenAction({...reminder,endsAt:'2026-10-19T20:00:00Z'},[show],Date.parse(start)).play,false);
  assert.equal(notificationOpenAction(reminder,[show],Date.parse(start)-16*60000).play,false);
});
test('notification validation handles overnight shows and effective-date boundaries in SAST',()=>{
  const night={...show,schedules:[{day:1,start:'23:00',end:'02:00',validFrom:'2026-10-19',validUntil:'2026-10-19'}]};
  const payload={...reminder,startsAt:'2026-10-19T21:00:00Z',endsAt:'2026-10-20T00:00:00Z'};
  assert.equal(notificationOpenAction(payload,[night],Date.parse('2026-10-19T23:00:00Z')).play,true);
  assert.equal(notificationOpenAction({...payload,startsAt:'2026-10-26T21:00:00Z',endsAt:'2026-10-27T00:00:00Z'},[night],Date.parse('2026-10-26T22:00:00Z')).play,false);
});

const publicBody=()=>({id:randomUUID(),sequence:1,token:'ExpoPushToken[abcdefghijklmnop]',platform:'android',environment:'preview',enabled:true,preferences:{enabled:true,scope:'favorites',leadMinutes:5},favorites:['restart'],oneTime:[]});
function deviceHarness({user=null,allowed=true}={}){
  const calls=[];
  const handler=createPushDeviceHandler({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='push_hit_limit'?allowed:{saved:true,sequence:1},error:null};},authorize:async()=>user,hash:async()=> 'a'.repeat(64),rateSalt:'server-only',deliveryEnabled:false});
  const request=(body=publicBody(),extra={})=>new Request('https://example.test/push-device',{method:'POST',headers:{'x-installation-secret':'a'.repeat(64),'content-type':'application/json',...extra},body:JSON.stringify(body)});
  return {calls,handler,request};
}
test('guest registration works without Auth and never trusts a caller-supplied account ID',async()=>{
  const h=deviceHarness();const response=await h.handler(h.request({...publicBody(),userId:uid}));assert.equal(response.status,200);
  assert.equal(h.calls.at(-1).args.p_user,null);assert.equal((await response.json()).deliveryEnabled,false);
});
test('registration verifies signed-in bearers, validates inputs and rate-limits without exposing secrets',async()=>{
  const h=deviceHarness({user:uid});assert.equal((await h.handler(h.request(publicBody(),{authorization:'Bearer user-token'}))).status,200);assert.equal(h.calls.at(-1).args.p_user,uid);
  const invalid=deviceHarness();assert.equal((await invalid.handler(invalid.request(publicBody(),{authorization:'Bearer fake'}))).status,401);
  assert.equal((await invalid.handler(invalid.request({...publicBody(),preferences:{enabled:true,scope:'all',leadMinutes:9}}))).status,400);
  assert.equal((await invalid.handler(invalid.request(publicBody(),{'x-installation-secret':'bad'}))).status,401);
  const limited=deviceHarness({allowed:false});assert.equal((await limited.handler(limited.request())).status,429);assert.equal(limited.calls.length,1);
});
function dispatcher(fetcher,enabled=true,phase='reminder'){
  const calls=[];let claimed=false;
  const job={id:randomUUID(),lease:randomUUID(),token:'ExpoPushToken[abcdefghijklmnop]',showId:'restart',title:'The Restart',time:'18:00',startsAt:start,endsAt:end,expiresAt:'2026-10-19T15:57:00Z',phase};
  const handler=createPushDispatchHandler({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='push_worker_lock'?true:name==='push_pending_receipts'?[]:name==='push_claim_jobs'&&!claimed?(claimed=true,[job]):name==='push_claim_jobs'?[]:null,error:null};},fetch:fetcher,enabled,workerSecret:'s'.repeat(64),accessToken:'server-token',environment:'preview',allowed:[],pause:async()=>{},now:()=>Date.parse(now)});
  const request=(secret='s'.repeat(64))=>new Request('https://example.test/dispatch',{method:'POST',headers:{authorization:'Bearer '+secret}});
  return {handler,calls,request,job};
}
test('dispatch requires a server secret and its kill switch prevents all sends',async()=>{
  const h=dispatcher(async()=>{throw Error('Must not send');},false);
  assert.equal((await h.handler(h.request('wrong'))).status,401);assert.equal((await h.handler(h.request())).status,200);assert.equal(h.calls.length,0);
});
test('sender builds typed expiring reminders with secure Expo authentication and stores ticket IDs',async()=>{
  const h=dispatcher(async(url,options)=>{
    assert.ok(url.endsWith('/send'));assert.equal(options.headers.Authorization,'Bearer server-token');
    const [message]=JSON.parse(options.body);assert.equal(message.data.showId,'restart');assert.equal(message.channelId,'ace-radio-updates');assert.ok(message.expiration);assert.equal(message.tag,message.collapseId);
    return new Response(JSON.stringify({data:[{status:'ok',id:'ticket-ok'}]}),{status:200});
  });
  assert.equal((await h.handler(h.request())).status,200);assert.equal(h.calls.find(c=>c.name==='push_finish_job').args.p_ticket,'ticket-ok');
});
test('temporary provider rejections back off; ambiguous timeouts and malformed success bodies are not blindly resent',async()=>{
  for(const [fetcher,state]of [[async()=>new Response('',{status:429}),'retry'],[async()=>{throw Error('timeout');},'uncertain'],[async()=>new Response('{}',{status:200}),'uncertain']]){
    const h=dispatcher(fetcher);await h.handler(h.request());assert.equal(h.calls.find(c=>c.name==='push_finish_job').args.p_state,state);
  }
});
test('the live alert uses on-air text and the existing payload so installed previews can open it',async()=>{
 const h=dispatcher(async(_url,options)=>{const[message]=JSON.parse(options.body);assert.match(message.title,/is on now/);assert.match(message.body,/favourite show/);assert.equal(message.data.kind,'show-reminder');assert.equal(message.data.version,1);assert.equal(types.parseShowReminder(message.data).showId,'restart');return new Response(JSON.stringify({data:[{status:'ok',id:'live-ticket'}]}));},true,'live');
 assert.equal((await h.handler(h.request())).status,200);
});
