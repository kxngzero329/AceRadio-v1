const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/components/ShowSpotlight.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const banners = Array.from({ length: 8 }, (_, i) => ({ id: `banner-${i}`, title: `Show ${i}`, image: { uri: `https://images.test/${i}.jpg` }, placement: 'home_spotlight', showId: `show-${i}` }));

// Drive the component with native scroll events independently of React's render
// timing. In particular, a loop acknowledgement can precede a stale momentum end.
function harness(platform = 'ios', reduced = false) {
  const slots = [], commands = [], timers = new Map(), frames = new Map();
  let cursor = 0, effects = [], dirty = false, tree, content = banners, timerId = 0;
  const same = (a, b) => a?.length === b.length && b.every((v, i) => Object.is(v, a[i]));
  const react = {
    memo: fn => fn,
    useRef: value => slots[cursor++] ??= { current: value },
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { const v = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(v, slots[i].value)) { slots[i].value = v; dirty = true; } }]; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++, prev = slots[i]; if (prev && same(prev.deps, deps)) return; const slot = slots[i] = { deps }; effects.push(() => { prev?.cleanup?.(); slot.cleanup = fn(); }); },
    useLayoutEffect(fn, deps) { react.useEffect(fn, deps); },
  };
  const elements = (node, predicate) => !node ? [] : Array.isArray(node) ? node.flatMap(n => elements(n, predicate)) : typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)];
  const imports = {
    react, 'react/jsx-runtime': { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    'react-native': { Platform: { OS: platform }, ScrollView: 'ScrollView', Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value }, AccessibilityInfo: { isScreenReaderEnabled: async () => false, addEventListener: () => ({ remove() {} }) }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-router': { useFocusEffect: callback => react.useEffect(callback, [callback]) },
    '@/utils/imageAspectRatio': { imageAspectRatio: () => 2 }, '@/utils/navigation': { router: { push() {} } },
    'lucide-react-native': { ChevronLeft: 'Left', ChevronRight: 'Right' }, '@/components/FittedImage': { FittedImage: 'Image' },
    '@/services/links': { openVerifiedLink() {} }, '@/context/ContentContext': { useContent: () => ({ banners: content }) },
    '@/theme/colors': { colors: {} }, '@/theme/layout': { layout: {} }, '@/theme/fonts': { fonts: {} }, '@/hooks/useReducedMotion': { useReducedMotion: () => reduced },
  };
  const exports = {};
  new vm.Script(source).runInNewContext({ exports, require(name) { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; }, setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => { frames.set(++timerId, fn); return timerId; }, cancelAnimationFrame: id => frames.delete(id) });
  const scroll = () => elements(tree, node => node.type === 'ScrollView')[0];
  const event = x => ({ nativeEvent: { contentOffset: { x } } });
  function render() { let n = 0; do { assert.ok(++n < 15, 'Render loop'); dirty = false; cursor = 0; effects = []; tree = exports.ShowSpotlight(); const list = scroll(); if (list) list.props.ref.current = { scrollTo: cmd => commands.push(cmd) }; effects.forEach(fn => fn()); } while (dirty); const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); return tree; }
  render();
  const h = { commands, render,
    get pages() { return scroll()?.props.children ?? []; },
    get count() { return elements(tree, node => node.props?.accessibilityRole === 'adjustable')[0]?.props.accessibilityValue.now; },
    get offset() { return scroll()?.props.contentOffset; },
    resize(width) { tree.props.onLayout({ nativeEvent: { layout: { width } } }); render(); },
    content(value) { content = value; render(); },
    press(direction) { const button = elements(tree, node => node.props?.accessibilityLabel === `${direction === 1 ? 'Next' : 'Previous'} show`)[0]; if (!button.props.disabled) button.props.onPress(); render(); },
    event(name, x) { scroll().props[name]?.(event(x)); render(); },
    autoplay() { for (const [id, timer] of [...timers]) if (timer.ms === 5500) { timers.delete(id); timer.fn(); } render(); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
  };
  h.resize(320);
  return h;
}

for (const platform of ['android', 'ios', 'web']) {
  test(`${platform}: arrows and swipes keep banner sources, keys and the initial offset stable`, () => {
    const h = harness(platform), original = h.pages.map(p => [p.key, p.props.banner.image.uri]), offset = h.offset;
    h.press(1); assert.equal(h.commands.at(-1).x, 640); h.event('onScroll', 640); assert.equal(h.count, 2);
    assert.equal(h.offset, offset, 'A render must not reset the native contentOffset');
    assert.deepEqual(h.pages.map(p => [p.key, p.props.banner.image.uri]), original);
    assert.equal(h.commands.length, 2, 'Normal page changes must not recenter the native list');
    h.event('onScrollBeginDrag', 640); h.event('onScrollEndDrag', 890); h.event('onMomentumScrollBegin', 890); h.event('onScroll', 960); h.event('onMomentumScrollEnd', 960);
    assert.equal(h.count, 3); assert.deepEqual(h.pages.map(p => [p.key, p.props.banner.image.uri]), original);
    assert.ok(h.pages.filter(p => p.props.loadImage).length <= 7, 'Only nearby artwork and loop copies should mount'); h.unmount();
  });
  test(`${platform}: loop copies reset to identical artwork and ignore stale completion events`, () => {
    const h = harness(platform);
    h.press(-1); h.event('onScroll', 0); assert.equal(h.count, banners.length);
    assert.equal(h.commands.at(-1).x, banners.length * 320); assert.equal(h.commands.at(-1).animated, false);
    const leading = h.pages[0], last = h.pages[banners.length];
    assert.equal(leading.props.banner, last.props.banner); assert.ok(leading.props.loadImage && last.props.loadImage);
    h.event('onScroll', banners.length * 320); h.event('onMomentumScrollEnd', 0); assert.equal(h.count, banners.length);
    h.press(1); h.event('onScroll', (banners.length + 1) * 320); assert.equal(h.count, 1); assert.equal(h.commands.at(-1).x, 320);
    h.event('onScroll', 320); h.event('onMomentumScrollEnd', (banners.length + 1) * 320);
    h.press(1); assert.equal(h.commands.at(-1).x, 640); h.event('onScroll', 640); assert.equal(h.count, 2); h.unmount();
  });
}
test('rotation and equivalent content refresh keep the current banner; membership changes reset safely', () => {
  const h = harness(); h.press(1); h.event('onScroll', 640); h.resize(400);
  assert.equal(h.count, 2); assert.equal(h.commands.at(-1).x, 800);
  const commands = h.commands.length; h.content(banners.map(b => ({ ...b, subtitle: 'Updated' })));
  assert.equal(h.count, 2); assert.equal(h.commands.length, commands);
  h.content(banners.slice(2)); assert.equal(h.count, 1); assert.equal(h.commands.at(-1).x, 400);
  h.content([banners[0]]); assert.equal(h.pages.length, 1); assert.equal(h.commands.at(-1).x, 0);
  h.content([]); assert.equal(h.pages.length, 0); h.unmount();
});
test('reduced motion advances without animation; cancelled swipes release controls and autoplay advances normally', () => {
  const reduced = harness('ios', true); reduced.press(1); assert.equal(reduced.commands.at(-1).animated, false); assert.equal(reduced.count, 2); reduced.unmount();
  const h = harness(); h.event('onScrollBeginDrag', 320); h.event('onScrollEndDrag', 320); h.event('onMomentumScrollEnd', 320);
  h.autoplay(); assert.equal(h.commands.at(-1).x, 640); h.event('onScroll', 640); assert.equal(h.count, 2); h.unmount();
});
