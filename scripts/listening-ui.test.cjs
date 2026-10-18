const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, imports = {}) {
  const filename = path.join(__dirname, '..', relative), exports = {};
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new vm.Script(output, { filename }).runInNewContext({ exports, require: name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

function links(platform, openURL) {
  const calls = [], alerts = [];
  const api = load('src/services/links.ts', { 'react-native': {
    Platform: { OS: platform }, Alert: { alert: (...args) => alerts.push(args) },
    Linking: {
      canOpenURL() { throw Error('Availability probes must not gate opening links'); },
      openURL(url) { calls.push(url); return openURL?.(url) ?? Promise.resolve(); },
    },
  } });
  return { ...api, calls, alerts };
}
const whatsapp = 'https://wa.me/27730676204';

test('native WhatsApp opens the studio chat directly without an availability probe', async () => {
  for (const platform of ['android', 'ios']) {
    const h = links(platform);
    const pending = h.openWhatsAppChat(whatsapp);
    assert.deepEqual(h.calls, ['whatsapp://send?phone=27730676204']);
    assert.equal(await pending, true);
    assert.deepEqual(h.alerts, []);
  }
});
test('WhatsApp falls back to the official HTTPS link if the app cannot open', async () => {
  const h = links('android', url => url.startsWith('whatsapp:') ? Promise.reject(Error('No activity')) : Promise.resolve());
  assert.equal(await h.openWhatsAppChat(whatsapp), true);
  assert.deepEqual(h.calls, ['whatsapp://send?phone=27730676204', whatsapp]);
  assert.deepEqual(h.alerts, []);
});
test('web opens WhatsApp HTTPS within the original user gesture', async () => {
  const h = links('web');
  const pending = h.openWhatsAppChat(whatsapp);
  assert.deepEqual(h.calls, [whatsapp], 'The first open must happen synchronously before an await');
  assert.equal(await pending, true);
});
test('failed native and HTTPS WhatsApp attempts report one actionable failure', async () => {
  const h = links('ios', () => Promise.reject(Error('No handler')));
  assert.equal(await h.openWhatsAppChat(whatsapp), false);
  assert.equal(h.alerts.length, 1);
  assert.equal(h.calls.length, 2);
});
test('invalid WhatsApp configurations do not open another destination', async () => {
  for (const url of ['https://wa.me.evil.example/27730676204', 'javascript:alert(1)', 'https://wa.me/+27730676204', 'https://wa.me/']) {
    const h = links('android');
    assert.equal(await h.openWhatsAppChat(url), false);
    assert.equal(h.calls.length, 0);
    assert.equal(h.alerts.length, 1);
  }
});
test('website links open directly even when an availability query would reject', async () => {
  const h = links('android');
  assert.equal(await h.openVerifiedLink('website', 'https://ace.radio'), true);
  assert.deepEqual(h.calls, ['https://ace.radio']);
});

const fonts = load('src/theme/fonts.ts');
const layout = load('src/theme/layout.ts');
const show = { id: 'mornings', title: 'Ace Mornings', presenter: 'Christopher Marshall', schedule: 'Weekdays · 06:00–09:00', presenterIds: [] };
const noop = () => null;
const native = {
  View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator', Animated: { View: 'AnimatedView' },
  Platform: { OS: 'android' }, StyleSheet: { create: value => value },
  useWindowDimensions: () => ({ fontScale: 1 }),
};
const typography = load('src/theme/typography.ts', { 'react-native': native, './colors': { colors: {} }, './fonts': fonts });
function find(node, predicate) {
  if (!node) return undefined;
  if (Array.isArray(node)) return node.map(item => find(item, predicate)).find(Boolean);
  if (typeof node !== 'object') return undefined;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
function details({ selected = false, live = true, playing = false, buffering = false, error = null, closing = false } = {}) {
  const calls = [];
  const MiniPlayer = () => null;
  const radio = {
    currentShow: selected ? show : { id: 'another' }, liveShows: live ? [show] : [],
    hasPlayed: true, playing, buffering, error,
    listenLive: id => calls.push(['listen', id]), toggle: () => calls.push(['toggle']), retry: () => calls.push(['retry']),
  };
  const Screen = load('app/show/[id].tsx', {
    'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useLocalSearchParams: () => ({ id: show.id }) },
    'lucide-react-native': { ChevronLeft: noop, Heart: noop, CalendarDays: noop, Mic2: noop, Play: noop, Pause: noop, Radio: noop },
    '@/components/ShowPoster': { ShowPoster: noop }, '@/components/FittedImage': { FittedImage: noop },
    '@/components/ContentStatus': { ContentStatus: noop }, '@/components/ShowShareButton': { ShowShareButton: noop },
    '@/components/MiniPlayer': { MiniPlayer }, '@/components/PlaybackButton': { PlaybackButton: noop },
    '@/context/ContentContext': { useContent: () => ({ shows: [show], presenters: [], loading: false, error: null }) },
    '@/context/FavoritesContext': { useFavorites: () => ({ isFavorite: () => false, toggleFavorite: noop }) },
    '@/context/RadioContext': { useRadio: () => radio },
    '@/hooks/useModalTransition': { useModalTransition: () => ({ close: () => calls.push(['close']), isClosing: closing, isTransitioning: false, style: {} }) },
    '@/theme/colors': { colors: {} }, '@/theme/fonts': fonts, '@/theme/layout': layout, '@/theme/typography': typography,
  }).default;
  const tree = Screen();
  return { calls, tree, mini: find(tree, node => node.type === MiniPlayer), button: find(tree, node => node.props?.testID === 'show-listen-live') };
}
test('already playing show details pause the existing stream without restarting or dismissing', () => {
  const h = details({ selected: true, playing: true });
  assert.equal(h.button.props.accessibilityLabel, 'Pause Ace Mornings');
  h.button.props.onPress();
  assert.deepEqual(h.calls, [['toggle']]);
  assert.equal(h.mini.props.placement, 'sheet');
});
test('paused selected show details resume the shared stream', () => {
  const h = details({ selected: true });
  assert.equal(h.button.props.accessibilityLabel, 'Resume Ace Mornings live stream');
  h.button.props.onPress();
  assert.deepEqual(h.calls, [['toggle']]);
});
test('connecting show remains cancellable and exposes its busy state', () => {
  const h = details({ selected: true, buffering: true });
  assert.equal(h.button.props.disabled, false);
  assert.equal(h.button.props.accessibilityState.busy, true);
  assert.match(h.button.props.accessibilityLabel, /Cancel connecting/);
  h.button.props.onPress();
  assert.deepEqual(h.calls, [['toggle']]);
});
test('selected connection error retries the shared player and displays its error', () => {
  const h = details({ selected: true, error: 'Connection interrupted' });
  assert.match(h.button.props.accessibilityLabel, /Retry/);
  assert.ok(find(h.tree, node => node.props?.testID === 'show-playback-error'));
  h.button.props.onPress();
  assert.deepEqual(h.calls, [['retry']]);
});
test('another live show selects that show while keeping details open', () => {
  const h = details({ playing: true });
  assert.equal(h.button.props.accessibilityLabel, 'Listen live to Ace Mornings');
  h.button.props.onPress();
  assert.deepEqual(h.calls, [['listen', show.id]]);
});
test('an off-air unselected show cannot start or pause someone else’s stream', () => {
  const h = details({ live: false, playing: true });
  assert.equal(h.button.props.disabled, true);
  h.button.props.onPress();
  assert.deepEqual(h.calls, []);
});
test('selected stream stays controllable after its schedule ends', () => {
  const h = details({ selected: true, playing: true, live: false });
  assert.equal(h.button.props.disabled, false);
  h.button.props.onPress();
  assert.deepEqual(h.calls, [['toggle']]);
});
test('closing details cannot dispatch another playback action', () => {
  const h = details({ selected: true, playing: true, closing: true });
  assert.equal(h.button.props.disabled, true);
  h.button.props.onPress();
  assert.deepEqual(h.calls, []);
});
