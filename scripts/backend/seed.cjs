const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'supabase/import/catalogue.json'), 'utf8'));
const tables = ['media_assets','presenters','shows','show_presenters','show_schedules','banners','announcements'];
function buildSeed() {
  const statements = ['-- Generated from supabase/import/catalogue.json. Rebuild with npm run backend:seed.', '-- Inserts missing records only. Never overwrites staff edits or deletes existing data.', 'begin;'];
  for (const table of tables) {
    const rows = manifest.records[table];
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]).map(key => '"' + key + '"').join(', ');
    const json = JSON.stringify(rows).replaceAll("'", "''");
    statements.push(`insert into public.${table} (${columns})\nselect ${columns} from jsonb_populate_recordset(null::public.${table}, '${json}'::jsonb)\non conflict do nothing;`);
  }
  return statements.join('\n\n') + '\n\ncommit;\n';
}
if (require.main === module) {
  fs.writeFileSync(path.join(root, 'supabase/seed.sql'), buildSeed());
  console.log('Generated non-destructive, repeatable content seed.');
}
module.exports = { buildSeed, manifest, root, tables };
