// Build a reviewable, credential-free import from captured API responses and existing assets.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const showsFile = arg('--shows');
const bannersFile = arg('--banners');
if (!process.argv.includes('--shows') || !process.argv.includes('--banners')) {
  throw Error('Provide --shows and --banners paths to captured AceRadio API responses.');
}
function readApi(file) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.status !== 'success' || !Array.isArray(value.data)) throw Error('Invalid API response');
  return value.data;
}
const filename = path.join(root, 'src/data/shows.ts');
const bundledExports = {};
new vm.Script(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText).runInNewContext({ exports: bundledExports, require: asset => path.relative(root, path.resolve(path.dirname(filename), asset)) });
const bundled = bundledExports.shows;
const apiShows = readApi(showsFile), apiBanners = readApi(bannersFile);
const aliases = { 'ace-mornings': 'mornings', 'the-renssance': 'renaissance', 'the-restart': 'restart', 'kittys-boombox-hits': 'kitty', 'retro-reloaded': 'retro' };
const localId = id => aliases[id] ?? id;
const slug = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const records = Object.fromEntries(['media_assets','presenters','shows','show_presenters','show_schedules','banners','announcements'].map(name => [name, []]));
const files = [];
function dimensions(bytes) {
  if (bytes.subarray(1,4).toString() === 'PNG') return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset < bytes.length - 8) {
      if (bytes[offset++] !== 0xff) continue;
      const marker = bytes[offset++];
      if ([0xc0,0xc1,0xc2,0xc3].includes(marker)) return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      if (marker === 0xd9 || marker === 0xda) break;
      offset += bytes.readUInt16BE(offset);
    }
  }
  throw Error('Unsupported image dimensions');
}
function media(id, localPath, bucket, sourceUrl, alt, embedded) {
  const bytes = fs.readFileSync(path.join(root, localPath));
  if (embedded && sha(Buffer.from(embedded.split(',')[1], 'base64')) !== sha(bytes)) throw Error('API image differs from bundled image: ' + localPath);
  const ext = path.extname(localPath).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : null;
  if (!mime || bytes.length > 10485760) throw Error('Invalid image: ' + localPath);
  const entry = { id, bucket_id: bucket, object_path: `${id.replace(/:/g, '/')}/${sha(bytes)}.${ext}`, mime_type: mime, ...dimensions(bytes), sha256: sha(bytes), alt_text: alt, source_url: sourceUrl ?? null, status: 'published' };
  records.media_assets.push(entry);
  files.push({ asset_id: id, local_path: localPath, bucket_id: bucket, object_path: entry.object_path, mime_type: mime, sha256: entry.sha256 });
  return id;
}
const seenPresenters = new Set();
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
for (const api of apiShows) {
  const id = localId(api.id);
  const fixture = bundled.find(show => show.id === id);
  if (!fixture) throw Error('Unmapped API show; review its stable ID and local assets: ' + api.id);
  if (!Array.isArray(api.hosts) || !api.hosts.every(host => typeof host === 'string' && host.trim())) throw Error('Invalid presenters: ' + api.id);
  const banner = apiBanners.find(item => item.show_id === api.id);
  const artwork = media('show:' + id, fixture.image, 'show-artwork', new URL(api.cover, 'https://api.ace.radio/').href, api.title, api.cover_base64);
  const poster = banner ? media('banner:' + banner.id, fixture.poster, 'banners', new URL(banner.cover, 'https://api.ace.radio/').href, banner.title, banner.cover_base64) : null;
  records.shows.push({ id, title: api.title, subtitle: api.tagline || null, description: fixture.detail || null, artwork_id: artwork, poster_id: poster, accent: fixture.accent, category: api.category, display_order: api.display_order, status: 'published', source_system: 'ace-api', external_id: api.id, source_payload: { schedule: api.schedule, hosts: api.hosts, created_at: api.created_at, updated_at: api.updated_at, description_source: 'src/data/shows.ts' } });
  api.hosts.forEach((name, position) => {
    const presenterId = slug(name);
    if (!seenPresenters.has(presenterId)) {
      seenPresenters.add(presenterId);
      const solo = apiShows.find(s => Array.isArray(s.hosts) && s.hosts.length === 1 && s.hosts[0] === name);
      const soloFixture = solo && bundled.find(s => s.id === localId(solo.id));
      const photo = name === 'Christopher Marshall' ? 'assets/founder-profiles/christopher.png' : soloFixture?.image;
      const photoId = photo ? media('presenter:' + presenterId, photo, 'presenter-photos', name === 'Christopher Marshall' ? null : new URL(solo.cover, 'https://api.ace.radio/').href, name) : null;
      records.presenters.push({ id: presenterId, name, bio: null, photo_id: photoId, status: 'published', source_system: 'ace-api', external_id: name });
    }
    records.show_presenters.push({ show_id: id, presenter_id: presenterId, position });
  });
  if (!api.schedule || !Array.isArray(api.schedule.days) || !/^\d{2}:\d{2}$/.test(api.schedule.startTime) || !/^\d{2}:\d{2}$/.test(api.schedule.endTime)) throw Error('Invalid schedule: ' + api.id);
  for (const day of api.schedule.days) {
    if (!days.includes(day)) throw Error('Unknown weekday: ' + day);
    records.show_schedules.push({ id: `${id}-${days.indexOf(day)}-${api.schedule.startTime.replace(':','')}`, show_id: id, day_of_week: days.indexOf(day), starts_at: api.schedule.startTime, ends_at: api.schedule.endTime, timezone: 'Africa/Johannesburg', valid_from: null, valid_until: null });
  }
}
for (const banner of apiBanners) {
  const image = records.media_assets.find(m => m.id === 'banner:' + banner.id);
  if (!image) throw Error('Banner has no verified artwork: ' + banner.id);
  records.banners.push({ id: banner.id, show_id: banner.show_id ? localId(banner.show_id) : null, title: banner.title, subtitle: banner.tagline || null, image_id: image.id, placement: 'home_spotlight', link_url: banner.link || null, display_order: banner.display_order, status: 'published', source_system: 'ace-api', external_id: banner.id });
}
for (const [table, rows] of Object.entries(records)) {
  const ids = rows.map(row => row.id ?? `${row.show_id}:${row.presenter_id}`);
  if (new Set(ids).size !== ids.length) throw Error('Duplicate IDs in ' + table);
}
const result = { version: 1, project_ref: fs.readFileSync(path.join(root, 'supabase/.temp/project-ref'), 'utf8').trim(), sources: ['https://api.ace.radio/shows','https://api.ace.radio/banners','src/data/shows.ts'], aliases, records, files };
fs.writeFileSync(path.join(root, 'supabase/import/catalogue.json'), JSON.stringify(result, null, 2) + '\n');
console.log('Prepared import:', Object.fromEntries(Object.entries(records).map(([table, rows]) => [table, rows.length])));
