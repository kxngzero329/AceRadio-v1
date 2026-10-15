const fs = require('node:fs');
const path = require('node:path');
const { projectKey, projectRef, root } = require('./linked-project.cjs');
const filename = path.join(root, '.env.local');
const key = projectKey(false);
if (key.startsWith('sb_secret_')) throw Error('A privileged key must never be used in the app.');
let contents = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
const values = { EXPO_PUBLIC_SUPABASE_URL: `https://${projectRef()}.supabase.co`, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key };
for (const [name,value] of Object.entries(values)) {
  const pattern = new RegExp(`^${name}=.*$`, 'm');
  contents = pattern.test(contents) ? contents.replace(pattern, `${name}=${value}`) : contents.trimEnd() + `\n${name}=${value}\n`;
}
if (!/^EXPO_PUBLIC_CONTENT_SOURCE=/m.test(contents)) contents += 'EXPO_PUBLIC_CONTENT_SOURCE=bundled\n';
fs.writeFileSync(filename, contents.trimStart(), { mode: 0o600 });
fs.chmodSync(filename, 0o600);
console.log('Saved public Supabase client configuration to ignored .env.local. Content source was not switched.');
