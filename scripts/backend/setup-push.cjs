// Installs only AceRadio's named cron job and its encrypted worker credential.
// Creates no push tokens or sample recipients and never enables delivery.
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {cli,projectRef,root}=require('./linked-project.cjs');
const {manifest}=require('./seed.cjs');
const {accessToken}=require('./management.cjs');
async function main(){
  if(!process.argv.includes('--apply')){
    console.log('Dry run. Would install/rotate the worker credential, store it in Supabase Vault, and schedule aceradio-show-reminders every minute. PUSH_ENABLED=false and PUSH_ALLOW_ALL=false. No notifications sent.');return;
  }
  const ref=projectRef(),confirmed=process.argv[process.argv.indexOf('--confirm-project')+1];
  if(!process.argv.includes('--confirm-project')||confirmed!==ref||confirmed!==manifest.project_ref)throw Error('Explicit project confirmation is required.');
  const secret=randomBytes(32).toString('hex');
  const directory=path.join(root,'.qa');fs.mkdirSync(directory,{recursive:true});
  const filename=path.join(directory,`push-worker-${randomBytes(8).toString('hex')}.env`);
  try{
    fs.writeFileSync(filename,`PUSH_WORKER_SECRET=${secret}\nPUSH_ENABLED=false\nPUSH_ALLOW_ALL=false\nPUSH_ENVIRONMENT=preview\n`,{mode:0o600});
    cli(['secrets','set','--project-ref',ref,'--env-file',filename]);
  }finally{if(fs.existsSync(filename))fs.unlinkSync(filename);}
  const query=`begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $setup$ declare existing uuid; begin
  select id into existing from vault.secrets where name='aceradio_push_worker_secret';
  if existing is null then perform vault.create_secret('${secret}','aceradio_push_worker_secret');
  else perform vault.update_secret(existing,'${secret}','aceradio_push_worker_secret'); end if;
end $setup$;
do $schedule$ begin
  if exists(select 1 from cron.job where jobname='aceradio-show-reminders') then
    perform cron.unschedule('aceradio-show-reminders');
  end if;
end $schedule$;
select cron.schedule('aceradio-show-reminders','* * * * *',$job$
  select net.http_post(
    url:='https://${ref}.supabase.co/functions/v1/push-dispatch',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='aceradio_push_worker_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=50000
  );
$job$);
commit;`;
  const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${accessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
  // Error bodies can contain SQL/credentials; never print them.
  if(!response.ok)throw Error(`Cron setup failed (HTTP ${response.status}). Sending remains disabled; rerun after checking Supabase Vault/pg_cron availability.`);
  console.log('Worker credential installed in Secrets/Vault. Named minute cron installed. Delivery remains DISABLED with an empty internal audience. Follow docs/push-notifications.md to configure Firebase/APNs and Expo push security.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
