const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, imports) {
  const filename = path.join(__dirname, '..', relative);
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(output, { filename }).runInNewContext({ exports, console, require(name) {
    assert.ok(imports[name], `Unexpected import: ${name}`);
    return imports[name];
  } });
  return exports;
}

function hooks() {
  const slots = [];
  let cursor, effects, dirty, renderHook, result;
  const same = (a, b) => a?.length === b.length && b.every((value, i) => Object.is(value, a[i]));
  const react = {
    useRef(value) { return slots[cursor++] ??= { current: value }; },
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: callback, deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (previous && same(previous.deps, deps)) return;
      const slot = slots[index] = { deps };
      effects.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 15, 'Hook must settle without a render loop');
      cursor = 0; effects = []; dirty = false;
      result = renderHook();
      effects.forEach(effect => effect());
    } while (dirty);
    return result;
  }
  return { react, render, mount(hook) { renderHook = hook; return render(); },
    get result() { return result; }, unmount() { slots.forEach(slot => slot.cleanup?.()); } };
}

// Run the production lifecycle with controlled native layout and animation callbacks.
function harness({ ready = false, reduced = false, state = 'active', platform = 'ios' } = {}) {
  const h = hooks(), timings = [], loops = [], listeners = new Set();
  let hides = 0;
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
  }
  const Animated = {
    Value,
    timing(value, config) {
      const animation = {
        config, started: false, stopped: false,
        start(callback) { this.started = true; this.callback = callback; },
        stop() { this.stopped = true; this.callback?.({ finished: false }); },
        finish() { value.setValue(config.toValue); this.callback?.({ finished: true }); },
      };
      timings.push(animation);
      return animation;
    },
    sequence(animations) { return animations; },
    loop(sequence) {
      const loop = { sequence, started: false, stopped: false,
        start() { this.started = true; }, stop() { this.stopped = true; } };
      loops.push(loop);
      return loop;
    },
  };
  const { useStartupTransition } = load('src/hooks/useStartupTransition.ts', {
    react: h.react,
    'react-native': { Animated, AppState: {
      currentState: state,
      addEventListener(name, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; },
    }, Platform: { OS: platform }, Easing: { quad: 0, cubic: 0, inOut: x => x, out: x => x } },
    'expo-splash-screen': { hide() { hides++; } },
    '@/hooks/useReducedMotion': { useReducedMotion(initiallyReduced) {
      assert.equal(initiallyReduced, true, 'Startup defaults to static until native preference is known');
      return reduced;
    } },
    '@/theme/motion': load('src/theme/motion.ts', {}),
  });
  h.mount(() => useStartupTransition(ready));
  return { ...h, timings, loops, listeners, get result() { return h.result; }, get hides() { return hides; },
    layout() { h.result.onOverlayLayout(); return h.render(); },
    logo() { h.result.onLogoReady(); return h.render(); },
    ready() { ready = true; return h.render(); },
    reduce(value) { reduced = value; return h.render(); },
    state(value) { listeners.forEach(listener => listener(value)); return h.render(); },
  };
}

test('native launch screen stays until overlay layout and logo are ready, in either order', () => {
  for (const order of [['layout', 'logo'], ['logo', 'layout']]) {
    const h = harness();
    assert.equal(h.hides, 0);
    h[order[0]]();
    assert.equal(h.hides, 0);
    h[order[1]]();
    assert.equal(h.hides, 1);
    h.layout(); h.logo();
    assert.equal(h.hides, 1, 'Repeated layout or image events cannot replay native hiding');
    h.unmount();
  }
});

test('a ready app still waits for a painted overlay before dismissing startup', () => {
  const h = harness({ ready: true });
  h.layout();
  assert.equal(h.timings.length, 0);
  assert.equal(h.result.visible, true);
  h.logo();
  assert.equal(h.timings.length, 1);
  assert.equal(h.loops.length, 0, 'Fast launches do not manufacture a loading phase');
  h.timings[0].finish(); h.render();
  assert.equal(h.result.visible, false);
});

test('loading bars run until first app layout, then stop and fade with no minimum delay', () => {
  const h = harness();
  h.layout(); h.logo();
  assert.equal(h.result.visible, true);
  assert.equal(h.loops.length, 5);
  assert.ok(h.loops.every(loop => loop.started));
  h.ready();
  assert.ok(h.loops.every(loop => loop.stopped));
  const fade = h.timings.at(-1);
  assert.equal(fade.config.toValue, 0);
  assert.equal(fade.config.duration, 380);
  assert.equal(fade.config.useNativeDriver, true);
  assert.equal(fade.config.isInteraction, false);
  assert.equal(h.result.visible, true, 'Overlay blocks input throughout the fade');
  fade.finish(); h.render();
  assert.equal(h.result.visible, false);
});

test('reduced motion keeps bars static and reveals the ready app immediately', () => {
  const h = harness({ reduced: true });
  h.layout(); h.logo();
  assert.equal(h.loops.length, 0);
  assert.equal(h.result.visible, true);
  h.ready();
  assert.equal(h.result.visible, false);
  assert.equal(h.timings.length, 0);
});

test('changing reduced motion during loading cancels loops and can safely resume them', () => {
  const h = harness();
  h.layout(); h.logo();
  h.reduce(true);
  assert.ok(h.loops.every(loop => loop.stopped));
  assert.equal(h.result.bars[0].value, 0.35);
  h.reduce(false);
  assert.equal(h.loops.length, 10);
  assert.ok(h.loops.slice(5).every(loop => loop.started && !loop.stopped));
  h.unmount();
  assert.ok(h.loops.every(loop => loop.stopped));
});

test('reduced motion interrupts an exit and ignores its late animation callback', () => {
  const h = harness({ ready: true });
  h.layout(); h.logo();
  const fade = h.timings.at(-1);
  h.reduce(true);
  assert.equal(fade.stopped, true);
  assert.equal(h.result.visible, false);
  fade.callback({ finished: true }); h.render();
  h.reduce(false);
  assert.equal(h.result.visible, false);
  assert.equal(h.timings.length, 1);
});

test('background loading stops decorative work and readiness releases without a hidden fade', () => {
  const h = harness();
  h.layout(); h.logo();
  h.state('background');
  assert.ok(h.loops.every(loop => loop.stopped));
  h.ready();
  assert.equal(h.result.visible, false);
  assert.equal(h.timings.filter(animation => animation.started).length, 0);
  h.state('active');
  assert.equal(h.result.visible, false, 'Returning to the app must not replay startup');
});

test('unfinished loading resumes when active; a backgrounded exit cannot trap startup', () => {
  const h = harness({ state: 'background' });
  h.layout(); h.logo();
  assert.equal(h.loops.length, 0);
  h.state('active');
  assert.equal(h.loops.length, 5);
  h.ready();
  const fade = h.timings.at(-1);
  h.state('inactive');
  assert.equal(h.result.visible, false);
  assert.equal(fade.stopped, true);
});

test('unmount cancels pending animation completions and removes the AppState subscription', () => {
  const h = harness({ ready: true });
  h.layout(); h.logo();
  const fade = h.timings.at(-1);
  h.unmount();
  assert.equal(h.listeners.size, 0);
  assert.equal(fade.stopped, true);
  fade.callback({ finished: true });
  assert.equal(h.result.visible, true, 'A stale callback must not update unmounted state');
});

test('web animates with the JS driver and retains the same ready/exit lifecycle', () => {
  const h = harness({ platform: 'web' });
  h.layout(); h.logo(); h.ready();
  assert.ok(h.timings.every(animation => !animation.config.useNativeDriver));
  h.timings.at(-1).finish(); h.render();
  assert.equal(h.result.visible, false);
});

test('native reduced-motion preference starts conservatively, updates and unsubscribes', async () => {
  const h = hooks();
  let resolvePreference, listener, removed = false;
  const { useReducedMotion } = load('src/hooks/useReducedMotion.ts', {
    react: h.react,
    'react-native': { Platform: { OS: 'ios' }, AccessibilityInfo: {
      isReduceMotionEnabled: () => new Promise(resolve => { resolvePreference = resolve; }),
      addEventListener(name, callback) { listener = callback; return { remove() { removed = true; } }; },
    } },
  });
  h.mount(() => useReducedMotion(true));
  assert.equal(h.result, true);
  resolvePreference(false); await Promise.resolve(); h.render();
  assert.equal(h.result, false);
  listener(true); h.render();
  assert.equal(h.result, true);
  h.unmount();
  assert.equal(removed, true);
});
