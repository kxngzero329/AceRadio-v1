// Deploy only the reviewed public statistics function to the explicitly confirmed project.
const { cli, projectRef } = require('./linked-project.cjs');
const { manifest } = require('./seed.cjs');
if (!process.argv.includes('--apply')) {
  console.log('Dry run. Would deploy only the listener-stats Edge Function. No database changes.');
  process.exit(0);
}
const confirmed = process.argv[process.argv.indexOf('--confirm-project') + 1];
if (!process.argv.includes('--confirm-project') || confirmed !== projectRef() || confirmed !== manifest.project_ref) {
  throw Error('Explicit --confirm-project must match the linked project and import manifest.');
}
cli(['functions','deploy','listener-stats','--project-ref',confirmed,'--use-api']);
console.log('Deployed the public listener-stats Edge Function. No database content or audio configuration was changed.');
