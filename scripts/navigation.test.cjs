const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '..', 'src/hooks/useModalTransition.ts');
const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const motionExports = {};
new vm.Script(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/theme/motion.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText).runInNewContext({ exports: motionExports });

// Run the production hook with controlled focus, navigation and animation callbacks.
// This checks lifecycle/race behavior; device animation frame rate needs a phone.
function harness({ focused = true, reducedMotion = false, canGoBack = true, platform = 'android', initialLocation = '/player' } = {}) {
  const slots = [];
  const animations = [];
  const dispatched = [];
  const requests = [];
  const historyEvents = [];
  const browserListeners = [];
  let cursor = 0;
  let effects = [];
  let preventRemove = false;
  let onRemove;
  let result;
  const sameDeps = (left, right) => left && right && left.length === right.length
    && left.every((item, index) => Object.is(item, right[index]));
  const react = {
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, value => { slots[index].value = value; }];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!sameDeps(slots[index]?.deps, deps)) {
        const previous = slots[index];
        const slot = { deps };
        slots[index] = slot;
        effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
      }
    },
  };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    interpolate({ outputRange }) {
      return { value: () => outputRange[0] + this.value * (outputRange[1] - outputRange[0]) };
    }
  }
  const Animated = {
    Value,
    timing(value, config) {
      const animation = {
        config, stopped: false, running: false,
        start(callback) {
          this.callback = callback;
          this.running = true;
          if (config.duration === 0) this.finish();
        },
        stop() {
          this.stopped = true;
          if (this.running) { this.running = false; this.callback?.({ finished: false }); }
        },
        finish() {
          if (!this.running) return;
          this.running = false;
          value.setValue(config.toValue);
          this.callback?.({ finished: true });
        },
      };
      animations.push(animation);
      return animation;
    },
  };
  const request = action => {
    requests.push(action);
    if (preventRemove) onRemove({ data: { action } });
    else dispatched.push(action);
  };
  const navigation = { dispatch: action => dispatched.push(action), isFocused: () => focused };
  class PopStateEvent {
    constructor(type, { state } = {}) { this.type = type; this.state = state; this.stopped = false; }
    stopImmediatePropagation() { this.stopped = true; }
  }
  const initialUrl = new URL(initialLocation, 'https://ace.example');
  const browserWindow = {
    location: { pathname: initialUrl.pathname, search: initialUrl.search, hash: initialUrl.hash },
    addEventListener(type, listener, capture) { browserListeners.push({ type, listener, capture }); },
    removeEventListener(type, listener) {
      const index = browserListeners.findIndex(item => item.type === type && item.listener === listener);
      if (index !== -1) browserListeners.splice(index, 1);
    },
    dispatchEvent(event) {
      for (const item of [...browserListeners].sort((a, b) => Number(Boolean(b.capture)) - Number(Boolean(a.capture)))) {
        if (item.type === event.type) item.listener(event);
        if (event.stopped) return false;
      }
      // Expo's linking listener processes the browser destination only after capture lets it through.
      historyEvents.push(event);
      if (this.location.pathname !== '/player') request({ type: 'RESET', payload: { state: event.state } });
      return true;
    },
  };
  const imports = {
    '@/theme/motion': motionExports,
    react,
    'react-native': {
      Animated, Platform: { OS: platform }, useWindowDimensions: () => ({ height: 800 }),
      Easing: { cubic: 'cubic', out: value => value, inOut: value => value },
    },
    'expo-router': {
      useNavigation: () => navigation,
      useIsFocused: () => focused,
      usePathname: () => '/player',
      useFocusEffect: callback => react.useEffect(() => focused ? callback() : undefined, [focused, callback]),
    },
    'expo-router/react-navigation': {
      usePreventRemove: (prevent, callback) => { preventRemove = prevent; onRemove = callback; },
    },
    '@/utils/navigation': {
      blurWebFocus: () => {},
      router: {
        canGoBack: () => canGoBack,
        back: () => request({ type: 'GO_BACK' }),
        replace: href => request({ type: 'REPLACE', payload: { href } }),
      },
    },
    '@/hooks/useReducedMotion': { useReducedMotion: () => reducedMotion },
  };
  const exports = {};
  const context = {
    exports,
    require: name => { assert.ok(imports[name], `Unexpected import: ${name}`); return imports[name]; },
  };
  if (platform === 'web') Object.assign(context, { window: browserWindow, PopStateEvent });
  else Object.defineProperty(context, 'window', { get() { throw new Error('Native hook accessed window'); } });
  const historyFilename = path.join(__dirname, '..', platform === 'web'
    ? 'src/utils/modalHistory.web.ts' : 'src/utils/modalHistory.ts');
  const historyOutput = ts.transpileModule(fs.readFileSync(historyFilename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const historyExports = {};
  new vm.Script(historyOutput, { filename: historyFilename }).runInNewContext({
    exports: historyExports, ...(platform === 'web' ? { window: browserWindow } : {}),
  });
  imports['@/utils/modalHistory'] = historyExports;
  new vm.Script(output, { filename }).runInNewContext(context);
  const render = () => {
    cursor = 0;
    effects = [];
    result = exports.useModalTransition();
    for (const effect of effects) effect();
    return result;
  };
  render();
  return {
    animations, dispatched, requests, request, render, historyEvents,
    get result() { return result; },
    get preventsRemoval() { return preventRemove; },
    focus(value) { focused = value; return render(); },
    reduceMotion(value) { reducedMotion = value; return render(); },
    browserLocation(destination) {
      const location = new URL(destination, 'https://ace.example');
      Object.assign(browserWindow.location, { pathname: location.pathname, search: location.search, hash: location.hash });
    },
    browserBack(destination, state) {
      const location = new URL(destination, 'https://ace.example');
      Object.assign(browserWindow.location, { pathname: location.pathname, search: location.search, hash: location.hash });
      const event = new PopStateEvent('popstate', { state });
      browserWindow.dispatchEvent(event);
      return event;
    },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

test('prefetched native player stays offscreen and unguarded until focus; entry uses UI thread', () => {
  const h = harness({ focused: false });
  assert.equal(h.animations.length, 0);
  assert.equal(h.preventsRemoval, false);
  assert.equal(h.result.style.transform[0].translateY.value(), 800);
  h.focus(true);
  assert.equal(h.preventsRemoval, true);
  assert.equal(h.animations.length, 1);
  assert.equal(h.animations[0].config.useNativeDriver, true);
  h.animations[0].finish();
  assert.equal(h.render().isTransitioning, false);
  assert.equal(h.result.style.transform[0].translateY.value(), 0);
});

test('down arrow and Android Back wait for the reverse slide before removing the player', () => {
  for (const trigger of ['arrow', 'hardware']) {
    const h = harness();
    h.animations[0].finish();
    const action = { type: 'GO_BACK', source: 'hardware-player' };
    if (trigger === 'arrow') h.result.close();
    else h.request(action);
    assert.equal(h.dispatched.length, 0);
    assert.equal(h.render().isClosing, true);
    const exiting = h.animations.at(-1);
    assert.equal(exiting.config.toValue, 0);
    assert.equal(exiting.config.useNativeDriver, true);
    exiting.finish();
    assert.equal(h.dispatched.length, 1);
    assert.equal(h.dispatched[0], trigger === 'arrow' ? h.requests[0] : action);
  }
});

test('rapid double close and repeated Back create one exit and dispatch the first original action once', () => {
  const h = harness();
  h.result.close();
  h.result.close();
  h.request({ type: 'GO_BACK', source: 'repeat-one' });
  h.request({ type: 'GO_BACK', source: 'repeat-two' });
  assert.equal(h.animations.length, 2);
  assert.equal(h.dispatched.length, 0);
  h.animations[1].finish();
  h.animations[1].finish();
  assert.equal(h.dispatched.length, 1);
  assert.equal(h.dispatched[0], h.requests[0]);
});

test('closing during entry cancels entry; focus cleanup leaves the newer exit running', () => {
  const h = harness();
  const entering = h.animations[0];
  h.result.close();
  const exiting = h.animations[1];
  assert.equal(entering.stopped, true);
  h.focus(false);
  assert.equal(exiting.stopped, false);
  assert.equal(h.dispatched.length, 0);
  entering.finish();
  assert.equal(h.dispatched.length, 0);
  exiting.finish();
  assert.equal(h.dispatched.length, 1);
});

test('reduced motion enters and dismisses immediately without scheduling an exit animation', () => {
  const h = harness({ reducedMotion: true });
  assert.equal(h.animations[0].config.duration, 0);
  assert.equal(h.result.style.transform[0].translateY.value(), 0);
  h.result.close();
  assert.equal(h.animations.length, 1);
  assert.equal(h.dispatched.length, 1);
  assert.equal(h.dispatched[0].type, 'GO_BACK');
});

test('a direct-linked player replaces with Home after its reverse slide when no Back route exists', () => {
  const h = harness({ canGoBack: false });
  h.animations[0].finish();
  h.result.close();
  assert.equal(h.requests[0].type, 'REPLACE');
  assert.equal(h.requests[0].payload.href, '/');
  assert.equal(h.dispatched.length, 0);
  h.animations[1].finish();
  assert.equal(h.dispatched[0], h.requests[0]);
});

test('web uses its supported driver; unmount cancels exit without dispatching after disposal', () => {
  const h = harness({ platform: 'web' });
  assert.equal(h.animations[0].config.useNativeDriver, false);
  h.result.close();
  const exiting = h.animations[1];
  assert.equal(exiting.config.useNativeDriver, false);
  h.unmount();
  assert.equal(exiting.stopped, true);
  exiting.finish();
  assert.equal(h.dispatched.length, 0);
});

test('an opened player stays visible without replaying entry on refocus or motion-preference changes', () => {
  const h = harness();
  h.animations[0].finish();
  h.focus(false);
  h.focus(true);
  h.reduceMotion(true);
  h.reduceMotion(false);
  assert.equal(h.animations.length, 1);
  assert.equal(h.result.style.transform[0].translateY.value(), 0);
  assert.equal(h.result.isTransitioning, false);
  assert.equal(h.preventsRemoval, true);
});

test('the removal guard remains active after an opened player loses focus', () => {
  const h = harness();
  h.animations[0].finish();
  h.focus(false);
  assert.equal(h.preventsRemoval, true);
  const action = { type: 'RESET', source: 'retained-player' };
  h.request(action);
  assert.equal(h.dispatched.length, 0);
  h.animations[1].finish();
  assert.equal(h.dispatched[0], action);
});

test('web captures browser Back before linking and releases its original state only after exit', () => {
  const h = harness({ platform: 'web' });
  h.animations[0].finish();
  const state = { id: 'shows-history' };
  const original = h.browserBack('/shows', state);
  assert.equal(original.stopped, true);
  assert.equal(h.historyEvents.length, 0);
  assert.equal(h.dispatched.length, 0);
  const exiting = h.animations[1];
  assert.equal(exiting.config.toValue, 0);
  exiting.finish();
  assert.equal(h.historyEvents.length, 1);
  assert.equal(h.historyEvents[0].state, state);
  assert.equal(h.dispatched.length, 1, 'Replayed linking removal bypasses the already completed slide');
  assert.equal(h.animations.length, 2);
});

test('repeated browser Back keeps one exit and releases only the latest history destination', () => {
  const h = harness({ platform: 'web' });
  h.animations[0].finish();
  h.browserBack('/shows', { id: 'shows-history' });
  const latest = { id: 'home-history' };
  h.browserBack('/', latest);
  assert.equal(h.animations.length, 2);
  assert.equal(h.historyEvents.length, 0);
  h.animations[1].finish();
  assert.equal(h.historyEvents.length, 1);
  assert.equal(h.historyEvents[0].state, latest);
  assert.equal(h.dispatched.length, 1);
});

test('same-path hash changes pass through without dismissing the web player', () => {
  const h = harness({ platform: 'web' });
  h.animations[0].finish();
  const original = h.browserBack('/player#artwork', { id: 'player-hash' });
  assert.equal(original.stopped, false);
  assert.equal(h.historyEvents.length, 1);
  assert.equal(h.animations.length, 1);
  assert.equal(h.render().isClosing, false);
});

test('browser Forward to the player cancels pending Back and restores the sheet without stale removal', () => {
  const h = harness({ platform: 'web' });
  h.animations[0].finish();
  h.browserBack('/shows', { id: 'shows-history' });
  const exiting = h.animations[1];
  const returning = h.browserBack('/player', { id: 'player-history' });
  assert.equal(returning.stopped, false);
  assert.equal(exiting.stopped, true);
  assert.equal(h.render().isClosing, false);
  exiting.finish();
  assert.equal(h.dispatched.length, 0);
  h.animations[2].finish();
  assert.equal(h.render().isTransitioning, false);
  assert.equal(h.result.style.transform[0].translateY.value(), 0);
  assert.equal(h.historyEvents.length, 1);
});

test('motion-preference changes during browser Back keep the original sheet path and latest destination', () => {
  const h = harness({ platform: 'web' });
  h.animations[0].finish();
  h.browserBack('/', { id: 'first-home' });
  h.reduceMotion(true);
  const latest = { id: 'latest-home' };
  const second = h.browserBack('/', latest);
  assert.equal(second.stopped, true, 'Home is still a destination after the capture listener refreshes');
  assert.equal(h.render().isClosing, true);
  assert.equal(h.animations.length, 2, 'The pending exit is retained instead of restoring the player');
  assert.equal(h.historyEvents.length, 0);
  h.animations[1].finish();
  assert.equal(h.historyEvents.length, 1);
  assert.equal(h.historyEvents[0].state, latest);
  assert.equal(h.dispatched.length, 1);
});

test('web uses the focused router path when history has not yet updated the player URL on mount', () => {
  const h = harness({ platform: 'web', initialLocation: '/' });
  h.browserLocation('/player');
  h.animations[0].finish();
  const original = h.browserBack('/', { id: 'home-history' });
  assert.equal(original.stopped, true, 'The initial Home URL must not become the player origin');
  assert.equal(h.historyEvents.length, 0);
  h.animations[1].finish();
  assert.equal(h.historyEvents.length, 1);
});

test('browser Back during an arrow exit releases the latest browser destination instead of the stale arrow action', () => {
  const h = harness({ platform: 'web' });
  h.animations[0].finish();
  h.result.close();
  const latest = { id: 'latest-home' };
  h.browserBack('/', latest);
  assert.equal(h.animations.length, 2);
  assert.equal(h.historyEvents.length, 0);
  h.animations[1].finish();
  assert.equal(h.historyEvents.length, 1);
  assert.equal(h.historyEvents[0].state, latest);
  assert.equal(h.dispatched.length, 1);
  assert.equal(h.dispatched[0].type, 'RESET');
  assert.equal(h.dispatched[0].payload.state, latest);
});
