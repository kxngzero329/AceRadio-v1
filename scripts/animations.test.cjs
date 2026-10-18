const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, imports, globals = {}) {
  const filename = path.join(__dirname, '..', relative);
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new vm.Script(output, { filename }).runInNewContext({ exports, require: name => {
    assert.ok(imports[name], `Unexpected import: ${name}`);
    return imports[name];
  }, ...globals });
  return exports;
}
const motion = load('src/theme/motion.ts', {});
const show = (id, title = id) => ({ id, title });

// Exercise the real metadata hook with manually completed/cancelled UI animations.
function harness({ initial = null, reduced = false, platform = 'ios' } = {}) {
  const slots = [], animations = [], frames = new Map();
  let cursor = 0, pending = [], result, dirty = false, frameId = 0, selection = initial;
  const react = {
    useRef(value) {
      const index = cursor++;
      return slots[index] ??= { current: value };
    },
    useState(value) {
      const index = cursor++;
      slots[index] ??= { value };
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (previous && previous.deps.length === deps.length && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      const slot = slots[index] = { deps };
      pending.push(() => { previous?.cleanup?.(); slot.cleanup = effect(); });
    },
  };
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
  }
  const Animated = { Value, timing(value, config) {
    const animation = {
      config, stopped: false,
      start(callback) { this.callback = callback; },
      stop() { this.stopped = true; this.callback?.({ finished: false }); },
      finish() { if (!this.stopped) { value.setValue(config.toValue); this.callback?.({ finished: true }); } },
    };
    animations.push(animation);
    return animation;
  } };
  const { useShowTransition } = load('src/hooks/useShowTransition.ts', {
    react,
    'react-native': { Animated, Platform: { OS: platform }, Easing: { quad: 0, cubic: 0, inOut: value => value, out: value => value } },
    '@/hooks/useReducedMotion': { useReducedMotion: () => reduced },
    '@/theme/motion': motion,
  }, {
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  function render() {
    let passes = 0;
    do {
      assert.ok(++passes < 12, 'Hook must settle without a render loop');
      dirty = false; cursor = 0; pending = [];
      result = useShowTransition(selection);
      for (const effect of pending) effect();
    } while (dirty);
    return result;
  }
  render();
  return {
    animations, frames, render,
    get result() { return result; },
    select(next) { selection = next; return render(); },
    reduce(value) { reduced = value; return render(); },
    frame() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); return render(); },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
  };
}

test('first playback fades in metadata while selection is available immediately', () => {
  const h = harness();
  const station = show('aceradio-live-stream');
  h.select(station);
  assert.equal(h.result.displayedShow, station);
  assert.equal(h.result.fade.value, 0);
  h.frame();
  assert.equal(h.animations[0].config.useNativeDriver, true);
  assert.equal(h.animations[0].config.isInteraction, false);
  h.animations[0].finish();
  assert.equal(h.result.fade.value, 1);
});

test('same-show refresh updates metadata without cancelling or restarting its fade', () => {
  const h = harness();
  h.select(show('a', 'Old title'));
  h.frame();
  const entering = h.animations.at(-1), count = h.animations.length;
  h.select(show('a', 'Updated title'));
  assert.equal(h.result.displayedShow.title, 'Updated title');
  assert.equal(entering.stopped, false);
  assert.equal(h.animations.length, count);
  assert.equal(h.result.fade.value, 0, 'Refresh must not force a partly visible value to 1');
  entering.finish();
  assert.equal(h.result.fade.value, 1);
});

test('rapid changes ignore stale fade completion and commit the latest metadata', () => {
  const a = show('a'), h = harness({ initial: a });
  h.frame();
  h.animations.at(-1)?.finish();
  h.select(show('b'));
  const stale = h.animations.at(-1);
  const latest = show('c', 'Current title');
  h.select(latest);
  assert.equal(stale.stopped, true);
  stale.callback({ finished: true });
  assert.equal(h.render().displayedShow, a);
  h.animations.at(-1).finish();
  assert.equal(h.render().displayedShow, latest);
  h.frame();
  h.animations.at(-1).finish();
  assert.equal(h.result.fade.value, 1);
});

test('refresh during outgoing fade is used when the new show becomes visible', () => {
  const h = harness({ initial: show('a') });
  h.select(show('b', 'Stale title'));
  const leaving = h.animations.at(-1);
  const fresh = show('b', 'Fresh title');
  h.select(fresh);
  assert.equal(leaving.stopped, false);
  leaving.finish();
  assert.equal(h.render().displayedShow, fresh);
});

test('returning to the outgoing show recovers its opacity without a stale selection', () => {
  const a = show('a'), h = harness({ initial: a });
  h.select(show('b'));
  const stale = h.animations.at(-1);
  h.result.fade.setValue(0.4);
  h.select(a);
  assert.equal(stale.stopped, true);
  h.frame();
  h.animations.at(-1).finish();
  stale.callback({ finished: true });
  assert.equal(h.render().displayedShow, a);
  assert.equal(h.result.fade.value, 1);
});

test('clearing playback cancels pending frames and metadata animations', () => {
  const h = harness();
  h.select(show('a'));
  assert.equal(h.frames.size, 1);
  h.select(null);
  h.frame();
  assert.equal(h.result.displayedShow, null);
  assert.equal(h.result.fade.value, 1);
  assert.equal(h.animations.length, 0);
});

test('reduced motion selects immediately and safely interrupts an active transition', () => {
  const h = harness({ initial: show('a') });
  const b = show('b');
  h.select(b);
  const leaving = h.animations.at(-1);
  h.reduce(true);
  assert.equal(h.result.displayedShow, b);
  assert.equal(h.result.fade.value, 1);
  assert.equal(leaving.stopped, true);
  leaving.callback({ finished: true });
  assert.equal(h.render().displayedShow, b);
  const count = h.animations.length;
  h.select(show('c'));
  assert.equal(h.result.displayedShow.id, 'c');
  assert.equal(h.animations.length, count);
});

test('web uses its supported driver and unmount prevents stale completion', () => {
  const h = harness({ platform: 'web', initial: show('a') });
  h.select(show('b'));
  const leaving = h.animations.at(-1);
  assert.equal(leaving.config.useNativeDriver, false);
  h.unmount();
  leaving.callback({ finished: true });
  assert.equal(h.frames.size, 0);
  assert.equal(h.result.displayedShow.id, 'a');
});
