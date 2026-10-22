const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { manifest, buildSeed } = require('./backend/seed.cjs');
const root = path.resolve(__dirname, '..');
const editor = '10000000-0000-0000-0000-000000000001';
const ordinary = '10000000-0000-0000-0000-000000000002';
let db, beforeRemoval;
function load(relative, imports = {}, extra = {}) {
  const filename = path.join(root,relative), exports = {};
  const output = ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new vm.Script(output,{ filename }).runInNewContext({ exports, require: name => { if (name === '@/components/CachedImage') return { CachedImage: imports['react-native']?.Image ?? 'Image' };
    if (name === '@/services/publicSnapshot') return { publicSnapshotEnabled: () => false, readPublicSnapshot: () => { throw Error('Unexpected snapshot request'); } };
    if (Object.hasOwn(imports,name)) return imports[name];
    if (name === 'zod') return require('zod');
    throw Error('Unexpected import: ' + name);
  }, AbortController, setTimeout, clearTimeout, ...extra });
  return exports;
}
const schedule = load('src/utils/showSchedule.ts');
const station = load('src/config/station.ts');
const repository = load('src/services/contentRepository.ts', {
  '@/services/supabase': { getSupabaseClient() { throw Error('Network access is not part of content mapping tests'); } },
  '@/config/content': { contentConfig: { source: 'supabase', url: 'https://test.supabase.co' } },
  '@/config/station': station,
  '@/utils/showSchedule': schedule,
});
const configuration = load('src/config/content.ts', {}, { process: { env: {} }, atob });
async function asRole(role, uid, action) {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? '']);
    await db.exec(`set local role ${role}`);
    return await action();
  } finally { await db.exec('rollback'); }
}
const content = () => db.query('select public.get_app_content_v3() as content').then(result => result.rows[0].content);
before(async () => {
  db = new PGlite();
  // Only Supabase-owned platform primitives are mocked. Application DDL, seed,
  // queries, grants and RLS below execute in an actual embedded PostgreSQL engine.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    grant select on storage.buckets to anon,authenticated,service_role;
  `);
  // Rehearse the original content upgrade here; accounts.test.cjs tests the next upgrade.
  const migrations = fs.readdirSync(path.join(root,'supabase/migrations')).filter(name => name.startsWith('20261015') && name.endsWith('.sql')).sort();
  for (const file of migrations.filter(name => !name.endsWith('_remove_station_tables.sql'))) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  await db.exec(buildSeed());
  // Rehearse the actual upgrade from the original populated station tables.
  for (const table of ['station_settings','station_team','station_milestones']) {
    const columns = Object.keys(manifest.records[table][0]).map(name=>'"'+name+'"').join(', ');
    await db.query(`insert into public.${table} (${columns}) select ${columns} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`,[JSON.stringify(manifest.records[table])]);
  }
  beforeRemoval = await asRole('anon',null,async () => ({
    v1:(await db.query('select public.get_app_content() as content')).rows[0].content,
    v2:(await db.query('select public.get_app_content_v2() as content')).rows[0].content,
  }));
  for (const file of migrations.filter(name => name.endsWith('_remove_station_tables.sql'))) await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
  await db.exec(buildSeed());
  await db.query('insert into auth.users(id) values ($1),($2)',[editor,ordinary]);
  await db.query("insert into app_private.content_staff(user_id,role) values ($1,'editor')",[editor]);
});
after(async () => { await db?.close(); });

test('migrations and seed return the complete verified public catalogue anonymously', async () => {
  await asRole('anon',null,async () => {
    const payload = await content();
    assert.equal(payload.shows.length,11);
    assert.equal(payload.presenters.length,10);
    assert.equal(payload.show_schedules.length,27);
    assert.equal(payload.banners.length,11);
    assert.equal(payload.media_assets.length,31);
    assert.equal(payload.announcements.length,0);
    const mapped = repository.decodeContent(payload,'https://test.supabase.co');
    assert.equal(mapped.shows.length,11);
    assert.ok(mapped.shows.every(show => show.listeners === undefined));
    assert.equal(mapped.shows.find(show => show.id === 'mornings').presenter,'Christopher Marshall');
    assert.equal(mapped.shows.find(show => show.id === 'top-20').presenter,'Christopher Marshall & Caitlin Sisam');
    assert.equal(mapped.presenters.find(presenter => presenter.name === 'Jarred Sisam').photo,undefined);
    assert.ok(mapped.presenters.every(presenter => presenter.bio === null));
    assert.ok(mapped.shows.every(show => show.image.uri.startsWith('https://test.supabase.co/storage/v1/object/public/')));
  });
});

test('the three station tables are removed and the current catalogue contains only radio content', async () => {
  const payload = await asRole('anon',null,content);
  assert.equal(payload.version,3);
  assert.ok(!('station_team' in payload) && !('station_milestones' in payload) && !('station_settings' in payload));
  assert.ok(!payload.media_assets.some(asset => asset.id === 'team:luke-henwood'));
  const result = await db.query("select tablename from pg_tables where schemaname='public'");
  assert.equal(result.rows.length,7);
  assert.ok(!result.rows.some(row=>['station_team','station_settings','station_milestones'].includes(row.tablename)));
  assert.ok(!/insert into public\.station_(team|settings|milestones)/.test(buildSeed()));
});

test('both legacy APIs preserve public content after table removal and old caches remain compatible', async () => {
  // Timestamps in the frozen production snapshot differ from this local seed;
  // all actual content, IDs, ordering, schedules and image references must match.
  const normalized = value => JSON.parse(JSON.stringify(value, (key, item) => ['created_at','updated_at'].includes(key) ? undefined : item));
  const previous = await asRole('anon',null,async () => (await db.query('select public.get_app_content_v2() as content')).rows[0].content);
  assert.deepEqual(normalized(previous),normalized(beforeRemoval.v2));
  const legacy = await asRole('anon',null,async () => (await db.query('select public.get_app_content() as content')).rows[0].content);
  assert.deepEqual(normalized(legacy),normalized(beforeRemoval.v1));
  assert.equal(legacy.version,1);
  assert.equal(legacy.station_team.length,2);
  assert.equal(legacy.station_milestones.length,3);
  assert.equal(legacy.station_settings.name,'AceRadio');
  assert.ok(legacy.station_settings.stream_url && legacy.station_settings.about.intro);
  const expected = repository.decodeContent(await content(),'https://test.supabase.co');
  assert.deepEqual(repository.decodeContent(previous,'https://test.supabase.co'),expected);
  // Old persisted values, including malformed unused fields, cannot change the
  // app's local identity/story or prevent the useful cached catalogue loading.
  legacy.station_team = null;
  legacy.station_milestones = 'unused';
  legacy.station_settings.about = { intro:999 };
  legacy.station_settings.name = 'Remote name ignored';
  legacy.station_settings.stream_url = 'Remote stream ignored';
  assert.deepEqual(repository.decodeContent(legacy,'https://test.supabase.co'),expected);
  assert.ok(!('team' in expected) && !('milestones' in expected) && !('contacts' in expected));
});

test('About renders its story, portraits and website without any content provider', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const about = load('src/data/about.ts', {
    '../../assets/founder-profiles/luke.png':'bundled/luke.png',
    '../../assets/founder-profiles/christopher.png':'bundled/christopher.png',
  });
  const container = ({children})=>React.createElement('div',null,children);
  const icon = ()=>null;
  const native = {View:container,Text:container,Pressable:container,Image:({source})=>React.createElement('img',{src:source}),StyleSheet:{create:value=>value}};
  const fonts = load('src/theme/fonts.ts');
  const typography = load('src/theme/typography.ts', {'react-native':native,'./colors':{colors:{}},'./fonts':fonts});
  const heading = load('src/components/PageHeading.tsx', {
    'react/jsx-runtime':require('react/jsx-runtime'), 'react-native':native, '@/theme/typography':typography, '@/theme/fonts':fonts,
  });
  const screen = load('app/(tabs)/about.tsx', {
    react:React, 'react/jsx-runtime':require('react/jsx-runtime'),
    'react-native':native,
    'react-native-safe-area-context':{SafeAreaView:container},
    'lucide-react-native':{Lightbulb:icon,RadioTower:icon,Infinity:icon,MapPin:icon,ArrowUpRight:icon},
    '@/components/PageScrollView':{PageScrollView:container},
    '@/components/ScreenHeader':{ScreenHeader:icon},
    '@/components/SocialLinks':{SocialLinks:icon},
    '@/components/PageHeading':heading,
    '@/hooks/usePageContentStyle':{usePageContentStyle:()=>({})},
    '@/theme/layout':load('src/theme/layout.ts'), '@/theme/typography':typography,
    '@/services/links':{openVerifiedLink:()=>{}},
    '@/data/about':about, '@/config/station':station, '@/theme/colors':{colors:{}}, '@/theme/fonts':fonts,
  }).default;
  const html = renderToStaticMarkup(React.createElement(screen));
  for (const text of ['Luke Henwood','Christopher Marshall','July 2025','3 October 2025','Radio. Reimagined.','bundled/luke.png','bundled/christopher.png','Official website']) assert.ok(html.includes(text),text);
  assert.ok(!html.includes('Loading station content') && !html.includes('Unable to load station content'));
});

test('import IDs preserve favourites and API provenance, and all image hashes are verified', () => {
  const ids = manifest.records.shows.map(show => show.id);
  assert.ok(ids.includes('mornings') && ids.includes('renaissance') && ids.includes('kitty') && ids.includes('retro'));
  assert.equal(manifest.records.shows.find(show => show.id === 'mornings').external_id,'ace-mornings');
  const crypto = require('node:crypto');
  for (const file of manifest.files) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file.local_path))).digest('hex'),file.sha256);
  assert.ok(!JSON.stringify(manifest).includes('base64'));
});

test('announcements preserve legacy caches and order active previews by priority without losing their full text', async () => {
  const payload = await content();
  const update = (id, priority) => ({ id, title:id, body:'Complete announcement\nIncluding its second paragraph.', link_url:null, starts_at:null, ends_at:null, ...(priority === undefined ? {} : {priority}) });
  const mapped = repository.decodeContent({...payload,announcements:[update('normal',0),update('important',10),update('legacy')]},'https://test.supabase.co');
  assert.deepEqual(Array.from(mapped.announcements,item=>item.id),['important','normal','legacy']);
  assert.equal(mapped.announcements[2].priority,0);
  assert.equal(mapped.announcements[0].body,'Complete announcement\nIncluding its second paragraph.');
});

test('seeding twice neither duplicates records nor overwrites a staff edit', async () => {
  const title = manifest.records.shows.find(show => show.id === 'mornings').title;
  await db.exec("update public.shows set title = 'Reviewed staff edit' where id = 'mornings'");
  await db.exec(buildSeed());
  const result = await db.query("select title from public.shows where id = 'mornings'");
  assert.equal(result.rows[0].title,'Reviewed staff edit');
  assert.equal((await content()).shows.length,11);
  await db.query("update public.shows set title = $1 where id = 'mornings'",[title]);
});

for (const role of ['anon','authenticated']) {
  test(`${role} cannot create content or grant itself staff membership`, async () => {
    await assert.rejects(asRole(role,ordinary,() => db.exec("insert into public.shows(id,title) values ('unauthorized','Unauthorized')")),/permission|row.level.security/i);
    await assert.rejects(asRole(role,ordinary,() => db.query("insert into app_private.content_staff(user_id,role) values ($1,'admin')",[ordinary])),/permission/i);
  });
  test(`${role} cannot update or delete published shows`, async () => {
    if (role === 'anon') {
      await assert.rejects(asRole(role,null,() => db.exec("update public.shows set title = 'Changed' where id = 'mornings'")),/permission/i);
      await assert.rejects(asRole(role,null,() => db.exec("delete from public.shows where id = 'mornings'")),/permission/i);
    } else {
      await asRole(role,ordinary,async () => {
        assert.equal((await db.query("update public.shows set title = 'Changed' where id = 'mornings'")).affectedRows,0);
        assert.equal((await db.query("delete from public.shows where id = 'mornings'")).affectedRows,0);
      });
    }
  });
}

test('approved staff can manage content; drafts stay out of the mobile RPC even for staff', async () => {
  await asRole('authenticated',editor,async () => {
    await db.exec("insert into public.shows(id,title) values ('draft-show','Draft show')");
    await db.exec("insert into public.show_schedules(id,show_id,day_of_week,starts_at,ends_at) values ('draft-slot','draft-show',1,'23:00','01:00')");
    assert.equal((await db.query("select * from public.shows where id = 'draft-show'")).rows.length,1);
    const payload = await content();
    assert.ok(!payload.shows.some(show => show.id === 'draft-show'));
    assert.ok(!payload.show_schedules.some(slot => slot.id === 'draft-slot'));
    await db.exec("update public.shows set status = 'published' where id = 'draft-show'");
    assert.ok((await content()).shows.some(show => show.id === 'draft-show'));
    await db.exec("delete from public.shows where id = 'draft-show'");
    assert.equal((await db.query("select * from public.show_schedules where id = 'draft-slot'")).rows.length,0);
  });
});

test('anonymous direct table reads hide unpublished parents and their relationship rows', async () => {
  await db.exec("insert into public.shows(id,title) values ('hidden-show','Hidden'); insert into public.show_schedules(id,show_id,day_of_week,starts_at,ends_at) values ('hidden-slot','hidden-show',1,'20:00','21:00'); insert into public.show_presenters(show_id,presenter_id) values ('hidden-show','christopher-marshall')");
  try {
    await asRole('anon',null,async () => {
      for (const [table,column,id] of [['shows','id','hidden-show'],['show_schedules','id','hidden-slot'],['show_presenters','show_id','hidden-show']]) assert.equal((await db.query(`select * from public.${table} where ${column} = $1`,[id])).rows.length,0);
    });
  } finally { await db.exec("delete from public.shows where id = 'hidden-show'"); }
});

test('Storage writes are restricted to staff and only the approved promotional buckets', async () => {
  for (const role of ['anon','authenticated']) await assert.rejects(asRole(role,ordinary,() => db.exec("insert into storage.objects(bucket_id,name) values ('banners','unauthorized.png')")),/row.level.security/i);
  await asRole('authenticated',editor,async () => {
    await db.exec("insert into storage.objects(bucket_id,name) values ('banners','approved.png')");
    assert.equal((await db.query("select * from storage.objects where name='approved.png'")).rows.length,1);
    await db.exec("update storage.objects set name='edited.png' where name='approved.png'; delete from storage.objects where name='edited.png'");
  });
  await db.exec("insert into storage.buckets(id,name,public) values ('private-test','private-test',false)");
  await assert.rejects(asRole('authenticated',editor,() => db.exec("insert into storage.objects(bucket_id,name) values ('private-test','forbidden.png')")),/row.level.security/i);
});

test('time-windowed and draft announcements never enter the public catalogue', async () => {
  await asRole('authenticated',editor,async () => {
    await db.exec("insert into public.announcements(title,body,status) values ('Draft','Draft body','draft'); insert into public.announcements(title,body,status,starts_at,ends_at) values ('Future','Future body','published','2099-01-01','2099-01-02'),('Expired','Expired body','published','2000-01-01','2000-01-02');");
    assert.equal((await content()).announcements.length,0);
  });
  assert.equal(repository.isContentInWindow({ startsAt:null, endsAt:'2026-10-15T12:00:00Z' },Date.parse('2026-10-15T12:00:00Z')),false,'Persisted expired content must disappear without waiting for a fetch');
});

test('database constraints reject broken relationships and invalid content', async () => {
  await assert.rejects(db.exec("insert into public.show_schedules(id,show_id,day_of_week,starts_at,ends_at) values ('bad','missing',1,'10:00','11:00')"),/foreign key/i);
  await assert.rejects(db.exec("insert into public.show_schedules(id,show_id,day_of_week,starts_at,ends_at) values ('bad','mornings',7,'10:00','11:00')"),/check constraint/i);
  await assert.rejects(db.exec("insert into public.announcements(title,body,link_url) values ('Bad','Bad','javascript:alert(1)')"),/check constraint/i);
  await assert.rejects(db.exec("insert into public.show_schedules(id,show_id,day_of_week,starts_at,ends_at) values ('bad','mornings',1,'10:00','10:00')"),/check constraint/i);
});

test('runtime validation rejects incompatible payloads and unsafe media paths', async () => {
  const payload = await content();
  assert.throws(() => repository.decodeContent({ ...payload, version:4 },'https://test.supabase.co'));
  const invalid = structuredClone(payload); invalid.media_assets[0].object_path = '../secret';
  assert.throws(() => repository.decodeContent(invalid,'https://test.supabase.co'));
  const empty = { ...payload, shows:[], presenters:[], show_presenters:[], show_schedules:[], banners:[], announcements:[], station_team:[], station_milestones:[], media_assets:[] };
  assert.equal(repository.decodeContent(empty,'https://test.supabase.co').shows.length,0);
});

test('published schedules follow SAST, inclusive starts and exclusive ends', async () => {
  const mapped = repository.decodeContent(await content(),'https://test.supabase.co');
  const mornings = mapped.shows.find(show => show.id === 'mornings');
  assert.equal(mornings.schedule,'Weekdays • 6:00 AM – 9:00 AM');
  assert.equal(schedule.isShowLive(mornings,new Date('2026-10-12T04:00:00Z')),true);
  assert.equal(schedule.isShowLive(mornings,new Date('2026-10-12T07:00:00Z')),false);
});

test('structured schedules support overnight slots and future effective dates', () => {
  const show = { id:'overnight', schedules:[{ day:1,start:'23:00',end:'01:00',validFrom:'2026-10-12',validUntil:'2026-10-12' }] };
  assert.equal(schedule.isShowLive(show,new Date('2026-10-12T22:30:00Z')),true);
  assert.equal(schedule.isShowLive(show,new Date('2026-10-12T23:00:00Z')),false);
  assert.equal(schedule.isShowLive(show,new Date('2026-10-19T22:30:00Z')),false);
  const future = schedule.getNextScheduledShow([{ ...show, schedules:[{ day:1,start:'06:00',end:'09:00',validFrom:'2026-11-02',validUntil:null }] }],new Date('2026-10-12T12:00:00Z'));
  assert.equal(future.startsAt.toISOString(),'2026-11-02T04:00:00.000Z');
});

test('the app rejects privileged keys and never enables Supabase implicitly', () => {
  const makeKey = role => 'header.' + Buffer.from(JSON.stringify({role})).toString('base64url') + '.signature';
  assert.equal(configuration.validateContentConfig(undefined,'https://test.supabase.co','sb_publishable_public').source,'bundled');
  for (const key of ['sb_secret_danger',makeKey('service_role'),'invalid']) {
    const config = configuration.validateContentConfig('supabase','https://test.supabase.co',key);
    assert.ok(config.error); assert.equal(config.key,'');
  }
  assert.equal(configuration.validateContentConfig('supabase','https://test.supabase.co',makeKey('anon')).error,null);
});

test('the production Supabase transport queries the actual RPC contract and validates the response', async () => {
  const { createClient } = require('@supabase/supabase-js');
  let requests = 0, fail = false;
  const client = createClient('https://test.supabase.co','sb_publishable_test', {
    auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
    global: { fetch: async (url, options) => {
      assert.equal(new URL(url).pathname,'/rest/v1/rpc/get_app_content_v3');
      assert.equal(options.method,'POST');
      requests++;
      if (fail) return new Response(JSON.stringify({message:'Unavailable'}),{status:503,headers:{'Content-Type':'application/json'}});
      const payload = await asRole('anon',null,content);
      return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json'}});
    } },
  });
  const transport = load('src/services/contentRepository.ts', {
    '@/services/supabase': { getSupabaseClient: () => client },
    '@/config/content': { contentConfig: { source:'supabase',url:'https://test.supabase.co' } },
    '@/config/station': station, '@/utils/showSchedule':schedule,
  });
  const { QueryClient } = require('@tanstack/react-query');
  const cache = new QueryClient({ defaultOptions:{queries:{retry:false,staleTime:0}} });
  const options = { queryKey:transport.contentQueryKey,queryFn:({signal})=>transport.fetchAppContent(signal) };
  const [first,second] = await Promise.all([cache.fetchQuery(options),cache.fetchQuery(options)]);
  assert.equal(requests,1,'Parallel screen reads share one request');
  assert.strictEqual(first,second);
  assert.equal(transport.decodeContent(first,'https://test.supabase.co').shows.length,11);
  fail = true;
  await assert.rejects(cache.fetchQuery(options),/Unable to update station content/);
  assert.equal(cache.getQueryData(options.queryKey).shows.length,11,'A failed refresh retains the last good public payload');
  cache.clear();
});

test('remaining application tables have RLS enabled and ordinary auth cannot edit presenter data', async () => {
  const rows=await db.query("select tablename,rowsecurity from pg_tables where schemaname = 'public'");
  assert.equal(rows.rows.length,7);
  assert.ok(rows.rows.every(row=>row.rowsecurity));
  await asRole('authenticated',ordinary,async () => {
    assert.equal((await db.query("update public.presenters set bio='Unapproved' where id='christopher-marshall'")).affectedRows,0);
    assert.equal((await db.query("delete from public.banners")).affectedRows,0);
  });
});
