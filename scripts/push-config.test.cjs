const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('native config generates the iOS push entitlement while preserving background radio playback', { timeout: 30000 }, () => {
  // Introspection applies the real Expo plugins in memory without rewriting the
  // developer's local Xcode project, credentials or provisioning profiles.
  const root = path.resolve(__dirname, '..');
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 25000,
    env: { ...process.env, EXPO_NO_DOTENV: '1' },
  });
  assert.equal(result.status, 0, 'Expo native config introspection must succeed');
  const config = JSON.parse(result.stdout);
  const ios = config._internal.modResults.ios;
  assert.ok(['development', 'production'].includes(ios.entitlements['aps-environment']), 'APNs requires an entitlement in the generated native app');
  assert.ok(ios.infoPlist.UIBackgroundModes.includes('audio'), 'Push setup must preserve background listening');
  assert.ok(config.ios.bundleIdentifier);
  assert.ok(config.extra.eas.projectId, 'Expo tokens must belong to the shared EAS project');
  assert.ok(ios.infoPlist.CFBundleURLTypes.some(type => type.CFBundleURLSchemes.includes(config.scheme)));
});
