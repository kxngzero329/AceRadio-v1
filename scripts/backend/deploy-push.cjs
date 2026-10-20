// Reconcile the SHARED project's history in an isolated ignored workspace. Never
// repair/revert website migrations or push unrelated pending application files.
const fs = require('node:fs');
const path = require('node:path');
const { cli, projectRef, root } = require('./linked-project.cjs');
const { manifest } = require('./seed.cjs');
const migrations = ['20261019100000_reminder_preferences.sql','20261019101000_push_delivery.sql','20261020130000_favorite_live_reminders.sql'];
const apply = process.argv.includes('--apply');
const confirmed = process.argv[process.argv.indexOf('--confirm-project') + 1];
if (apply && (!process.argv.includes('--confirm-project') || confirmed !== projectRef() || confirmed !== manifest.project_ref)) throw Error('Explicit --confirm-project must match the linked AceRadio project.');
const qa = path.join(root,'.qa');fs.mkdirSync(qa,{recursive:true});
const workspace = fs.mkdtempSync(path.join(qa,'push-deploy-'));
const supabase = path.join(workspace,'supabase');
fs.mkdirSync(path.join(supabase,'.temp'),{recursive:true});
fs.copyFileSync(path.join(root,'supabase/config.toml'),path.join(supabase,'config.toml'));
fs.cpSync(path.join(root,'supabase/templates'),path.join(supabase,'templates'),{recursive:true});
for(const file of fs.readdirSync(path.join(root,'supabase/.temp'))) {
  const source=path.join(root,'supabase/.temp',file);
  if(fs.statSync(source).isFile())fs.copyFileSync(source,path.join(supabase,'.temp',file));
}
cli(['--workdir',workspace,'migration','fetch','--linked']);
for(const file of migrations) fs.copyFileSync(path.join(root,'supabase/migrations',file),path.join(supabase,'migrations',file));
const preview=cli(['--workdir',workspace,'db','push','--linked','--dry-run']);
console.log('Shared remote history fetched without altering it. Reviewed reminder migrations: '+migrations.join(', '));
if (!apply) { console.log('Dry run complete. Use --apply --confirm-project '+projectRef()+' to deploy these migrations and only push-device/push-dispatch. Sending is not enabled by this command.');process.exit(0); }
cli(['--workdir',workspace,'db','push','--linked','--yes']);
for(const name of ['push-device','push-dispatch']) cli(['functions','deploy',name,'--project-ref',confirmed,'--use-api']);
console.log('Reminder migrations and two Edge Functions deployed. Existing website history, content, cron and sender settings preserved. Do not rerun backend:setup-push on an already configured sender.');
