const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { manifest, buildSeed, root, tables } = require('./seed.cjs');
const { cli, projectKey, projectRef } = require('./linked-project.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  for (const file of manifest.files) {
    const absolute = path.resolve(root, file.local_path);
    if (!absolute.startsWith(root + path.sep) || sha(fs.readFileSync(absolute)) !== file.sha256) throw Error('Missing or changed source image: ' + file.local_path);
  }
  console.log('Verified source files:', manifest.files.length);
  console.log('Records:', Object.fromEntries(tables.map(name => [name, manifest.records[name].length])));
  if (!process.argv.includes('--apply')) { console.log('Dry run only. No network writes.'); return; }
  const target = process.argv[process.argv.indexOf('--confirm-project') + 1];
  if (!process.argv.includes('--confirm-project') || target !== projectRef() || target !== manifest.project_ref) throw Error('Explicit --confirm-project must match the linked project and import manifest.');
  const client = createClient(`https://${projectRef()}.supabase.co`, projectKey(true), { auth: { persistSession: false, autoRefreshToken: false } });
  // Content-addressed files are immutable; existing objects are verified, never overwritten.
  let verified = 0;
  for (const file of manifest.files) {
    const bytes = fs.readFileSync(path.join(root, file.local_path));
    const { error } = await client.storage.from(file.bucket_id).upload(file.object_path, bytes, { contentType: file.mime_type, cacheControl: '31536000', upsert: false });
    if (error) {
      const existing = await client.storage.from(file.bucket_id).download(file.object_path);
      if (existing.error || sha(Buffer.from(await existing.data.arrayBuffer())) !== file.sha256) throw Error('Storage upload/conflict could not be verified: ' + file.asset_id);
    }
    verified++;
    if (verified % 8 === 0 || verified === manifest.files.length) console.log(`Storage verified: ${verified}/${manifest.files.length}`);
  }
  const seed = path.join(root, 'supabase/seed.sql');
  fs.writeFileSync(seed, buildSeed());
  cli(['db','query','--linked','--file',seed]);
  console.log('Import completed. Existing records and objects were not overwritten.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
