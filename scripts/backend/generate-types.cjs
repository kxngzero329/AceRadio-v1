const fs = require('node:fs');
const path = require('node:path');
const { cli, root } = require('./linked-project.cjs');
const types = cli(['gen','types','typescript','--linked','--schema','public']);
if (!types.startsWith('export type Json') || !types.includes('get_app_content_v3') || /station_(settings|team|milestones):/.test(types)) throw Error('Unexpected generated database types; existing file was preserved.');
fs.writeFileSync(path.join(root,'src/types/database.ts'),'// Generated from the linked public schema. Refresh with npm run backend:types.\n' + types);
console.log('Generated src/types/database.ts from the deployed public schema.');
