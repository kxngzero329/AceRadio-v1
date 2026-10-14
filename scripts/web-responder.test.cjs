const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');

// Exercise the actual dependency's event listeners without a browser or React mocks.
function withResponder(run) {
  const packageRoot = path.dirname(require.resolve('react-native-web/package.json'));
  for (const filename of Object.keys(require.cache)) {
    if (filename.startsWith(packageRoot + path.sep)) delete require.cache[filename];
  }
  const previousWindow = global.window;
  const previousDocument = global.document;
  const previousWarn = console.warn;
  const previousError = console.error;
  const messages = [];
  const handlers = new Map();
  const document = { createElement() {}, addEventListener: (type, listener) => handlers.set(type, listener) };
  global.document = document;
  global.window = { document, addEventListener: (type, listener) => handlers.set(type, listener) };
  console.warn = (...args) => messages.push(args.join(' '));
  console.error = (...args) => messages.push(args.join(' '));
  try {
    const system = require(path.join(packageRoot, 'dist/cjs/modules/useResponderEvents/ResponderSystem.js'));
    const target = { contains: node => node === target };
    const lifecycle = [];
    system.attachListeners();
    system.addNode(1, target, {
      onStartShouldSetResponder: () => true,
      onResponderGrant: () => lifecycle.push('grant'),
      onResponderMove: () => lifecycle.push('move'),
      onResponderEnd: () => lifecycle.push('end'),
      onResponderRelease: () => lifecycle.push('release'),
      onResponderTerminate: () => lifecycle.push('cancel'),
    });
    let timeStamp = 0;
    const emit = (type, props = {}) => handlers.get(type)({
      type, target, composedPath: () => [target], button: 0,
      buttons: type === 'mouseup' ? 0 : 1, ctrlKey: false, altKey: false,
      clientX: 889, clientY: 149, pageX: 889, pageY: 149,
      timeStamp: ++timeStamp, ...props,
    });
    run({ emit, lifecycle, system, target });
    assert.deepEqual(messages, [], 'No touch-history warnings or errors');
  } finally {
    console.warn = previousWarn;
    console.error = previousError;
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
}

for (const [name, props] of [
  ['right click', { button: 2, buttons: 2 }],
  ['middle click', { button: 1, buttons: 4 }],
  ['Ctrl-click', { ctrlKey: true }],
  ['Alt-click', { altKey: true }],
]) {
  test(`${name} does not end an unstarted touch`, () => withResponder(({ emit, lifecycle }) => {
    emit('mousedown', props);
    emit('mouseup', { ...props, buttons: 0 });
    assert.deepEqual(lifecycle, []);
    emit('mousedown');
    emit('mouseup');
    assert.deepEqual(lifecycle, ['grant', 'end', 'release']);
  }));
}

test('a mouse release captured without its start is ignored', () => withResponder(({ emit, lifecycle }) => {
  emit('mouseup');
  assert.deepEqual(lifecycle, []);
  emit('mousedown');
  emit('mousemove');
  emit('mouseup');
  assert.deepEqual(lifecycle, ['grant', 'move', 'end', 'release']);
}));

test('releasing a secondary button does not end an active primary press', () => withResponder(({ emit, lifecycle, system, target }) => {
  emit('mousedown');
  emit('mousedown', { button: 2, buttons: 3 });
  emit('mouseup', { button: 2, buttons: 1 });
  assert.deepEqual(lifecycle, ['grant']);
  assert.equal(system.getResponderNode(), target);
  emit('mouseup');
  assert.deepEqual(lifecycle, ['grant', 'end', 'release']);
}));

test('mouse cancellation and subsequent clicks work', () => withResponder(({ emit, lifecycle }) => {
  emit('mousedown');
  emit('blur', { target: global.window });
  emit('mouseup');
  emit('mousedown');
  emit('mouseup');
  assert.deepEqual(lifecycle, ['grant', 'cancel', 'grant', 'end', 'release']);
}));

test('touch taps, drags, cancellation and emulated mouse events work', () => withResponder(({ emit, lifecycle, target }) => {
  const touch = { identifier: 1, clientX: 80, clientY: 100, pageX: 80, pageY: 100, target };
  emit('touchstart', { changedTouches: [touch], touches: [touch] });
  emit('touchend', { changedTouches: [touch], touches: [] });
  // Browser-generated mouse events after a tap must not produce a second press.
  emit('mousedown');
  emit('mouseup');
  assert.deepEqual(lifecycle, ['grant', 'end', 'release']);
  emit('touchstart', { changedTouches: [touch], touches: [touch] });
  emit('touchmove', { changedTouches: [touch], touches: [touch] });
  emit('touchcancel', { changedTouches: [touch], touches: [] });
  assert.deepEqual(lifecycle, ['grant', 'end', 'release', 'grant', 'move', 'end', 'cancel']);
  emit('mousedown');
  emit('mouseup');
  assert.deepEqual(lifecycle.slice(-3), ['grant', 'end', 'release']);
}));
