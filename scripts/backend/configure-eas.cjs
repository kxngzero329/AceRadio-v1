// Configure only the public client variables; never print credentials or unrelated settings.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { projectKey, projectRef, root } = require('./linked-project.cjs');
const environments = [];
for (let index = 0; index < process.argv.length; index++) if (process.argv[index] === '--environment') environments.push(process.argv[index + 1]);
if (!environments.length) environments.push('preview');
if (!environments.every(name => ['development','preview','production'].includes(name))) throw Error('Unsupported EAS environment.');
if (!process.argv.includes('--apply')) {
  console.log('Dry run. Would set only EXPO_PUBLIC_CONTENT_SOURCE, EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in:',environments.join(', '));
  process.exit(0);
}
const confirmed = process.argv[process.argv.indexOf('--confirm-project') + 1];
if (!process.argv.includes('--confirm-project') || confirmed !== projectRef()) throw Error('Explicit --confirm-project must match the linked Supabase project.');
const projectId = JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).expo.extra.eas.projectId;
function eas(args) {
  const result = spawnSync('npx',['--yes','eas-cli@latest',...args], { cwd:root,encoding:'utf8',timeout:120000,maxBuffer:5*1024*1024 });
  if (result.status !== 0) throw Error('EAS configuration failed. Check EAS login/project access; no credentials were printed.');
  return result.stdout;
}
if (!eas(['project:info']).includes(projectId)) throw Error('Unexpected EAS project. Settings were not changed.');
const values = { EXPO_PUBLIC_SUPABASE_URL:`https://${projectRef()}.supabase.co`,EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:projectKey(false),EXPO_PUBLIC_CONTENT_SOURCE:'supabase' };
for (const [name,value] of Object.entries(values)) {
  eas(['env:set',...environments.flatMap(environment=>['--environment',environment]),'--name',name,'--value',value,'--type','string','--visibility','plaintext','--scope','project','--non-interactive','--json']);
  console.log('Configured public variable:',name);
}
console.log('EAS environments configured:',environments.join(', '));
