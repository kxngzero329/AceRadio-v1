// Read-only verification against the linked project using the mobile public role.
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { projectKey, projectRef } = require('./linked-project.cjs');
const { manifest } = require('./seed.cjs');
async function main() {
  const client = createClient(`https://${projectRef()}.supabase.co`, projectKey(false), { auth: { persistSession:false, autoRefreshToken:false } });
  const { data, error } = await client.rpc('get_app_content_v3');
  if (error) throw Error('Public content RPC is unavailable. Check the deployed migrations and grants.');
  if (data?.version !== 3) throw Error('Unsupported content API version.');
  for (const name of ['shows','presenters','show_presenters','show_schedules','banners','media_assets','announcements']) {
    if (!Array.isArray(data[name])) throw Error('Invalid public payload: ' + name);
  }
  if (['station_team','station_milestones','station_settings'].some(key => key in data)) throw Error('Removed station data is still in the current catalogue.');
  const legacy = await client.rpc('get_app_content');
  if (legacy.error || legacy.data?.version !== 1 || !Array.isArray(legacy.data.station_team) || !Array.isArray(legacy.data.station_milestones)) throw Error('Legacy catalogue compatibility failed.');
  const previous = await client.rpc('get_app_content_v2');
  if (previous.error || previous.data?.version !== 2 || !previous.data.station_settings?.website) throw Error('Previous catalogue compatibility failed.');
  for (const table of ['station_team','station_settings','station_milestones']) {
    const result = await client.from(table).select('id').limit(1);
    if (!result.error || !['PGRST205','42P01'].includes(result.error.code)) throw Error('Station table removal could not be confirmed: '+table);
  }
  console.log('All three station tables are absent. Legacy v1/v2 APIs remain available.');
  console.log('Public content counts:', Object.fromEntries(Object.entries(data).filter(([,value])=>Array.isArray(value)).map(([name,value])=>[name,value.length])));
  const actual = new Set(data.shows.map(show => show.id));
  const missing = manifest.records.shows.filter(show => !actual.has(show.id));
  if (missing.length) throw Error('Imported shows are missing or not published: ' + missing.map(show=>show.id).join(', '));
  let verified = 0;
  const activeAssets = new Set(data.media_assets.map(asset => asset.id));
  for (const file of manifest.files.filter(file => activeAssets.has(file.asset_id))) {
    const { data: image, error: imageError } = await client.storage.from(file.bucket_id).download(file.object_path);
    if (imageError || !image) throw Error('Public artwork is unreadable: ' + file.asset_id);
    const hash = crypto.createHash('sha256').update(Buffer.from(await image.arrayBuffer())).digest('hex');
    if (hash !== file.sha256) throw Error('Public artwork differs from the verified source: ' + file.asset_id);
    verified++;
  }
  console.log(`Verified ${verified} public Storage images. No remote data was modified.`);
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
