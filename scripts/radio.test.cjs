const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute the production TypeScript modules; bundled artwork resolves to paths.
function loadModule(relativePath, imports = {}) {
  const filename = path.join(__dirname, '..', relativePath);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new vm.Script(output, { filename }).runInNewContext({
    exports, setTimeout, clearTimeout, require: asset => {
      if (imports[asset]) return imports[asset];
      assert.ok(fs.existsSync(path.resolve(path.dirname(filename), asset)), 'Artwork must exist: ' + asset);
      return asset;
    },
  });
  return exports;
}

const schedule = loadModule('src/utils/showSchedule.ts');
const { isShowLive, getLiveShows, getNextScheduledShow } = schedule;
const { selectLiveShow, selectShow, selectAdjacentLiveShow } = loadModule('src/utils/radio.ts', {
  '@/utils/showSchedule': schedule,
});
const playbackModule = loadModule('src/utils/RadioPlayback.ts');
const { RadioPlayback, STREAM_ERROR_MESSAGE } = playbackModule;
const { shows } = loadModule('src/data/shows.ts');
const { createStationStreamShow, STATION_STREAM_SHOW_ID } = loadModule('src/data/stationShow.ts');
const morningSlot = new Date('2026-10-12T04:00:00Z');
const midmorningSlot = new Date('2026-10-12T07:30:00Z');
const live = getLiveShows(shows, midmorningSlot);
const url = 'https://studio.ace.radio/stream';
const metadata = show => ({ title: show.title, artist: show.presenter });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
function harness(t, options = {}) {
  const sessions = [];
  const player = new RadioPlayback(url, (source, details, notify) => {
    const session = { source, details, notify, plays: 0, disposed: false };
    sessions.push(session);
    return {
      play() { session.plays++; return options.playPromise; },
      setMetadata(next) { session.details = next; },
      dispose() { session.disposed = true; },
    };
  }, options.timeout);
  t.after(() => player.dispose());
  return { player, sessions };
}

test('preview fixtures keep unique IDs, bundled artwork and listener counts', () => {
  assert.equal(new Set(shows.map(show => show.id)).size, shows.length);
  assert.equal(shows.length, 11);
  assert.ok(shows.every(show => show.schedule && show.day));
  assert.equal(live.length, 1);
  assert.equal(live[0].id, 'renaissance');
  assert.ok(shows.filter(show => show.listeners).every(show => Number.isInteger(show.listeners) && show.listeners > 0));
});

test('show live status follows day, start/end boundaries, and SAST independently of device timezone', () => {
  assert.equal(isShowLive(shows.find(show => show.id === 'mornings'), morningSlot), true);
  assert.equal(isShowLive(shows.find(show => show.id === 'renaissance'), midmorningSlot), true);
  assert.equal(isShowLive(shows.find(show => show.id === 'renaissance'), new Date('2026-10-12T10:00:00Z')), false);
  assert.equal(isShowLive(shows.find(show => show.id === 'mornings'), new Date('2026-10-12T07:00:00Z')), false);
  assert.equal(isShowLive(shows.find(show => show.id === 'kitty'), new Date('2026-10-13T16:00:00Z')), true);
  assert.equal(isShowLive(shows.find(show => show.id === 'kitty'), new Date('2026-10-12T16:00:00Z')), false);
});

test('next-show notice resolves the next scheduled slot across weekdays and weekends', () => {
  const next = getNextScheduledShow(shows, new Date('2026-10-12T09:59:00Z'));
  assert.equal(next.show.id, 'midday-mix');
  assert.equal(next.startsAt.toISOString(), '2026-10-12T10:00:00.000Z');
  const afterWeekend = getNextScheduledShow(shows, new Date('2026-10-18T14:00:00Z'));
  assert.equal(afterWeekend.show.id, 'mornings');
  assert.equal(afterWeekend.startsAt.toISOString(), '2026-10-19T04:00:00.000Z');
});

test('Listen Live selects the scheduled show and handles off-air times', () => {
  assert.equal(selectLiveShow(shows, undefined, Math.random, midmorningSlot), live[0]);
  assert.equal(selectLiveShow(shows, undefined, Math.random, new Date('2026-10-13T20:00:00Z')), null);
  assert.equal(selectLiveShow([], undefined, Math.random, midmorningSlot), null);
});

test('off-air playback metadata uses the station stream identity and bounded listener estimate', () => {
  const quietStream = createStationStreamShow(() => 0);
  const busyStream = createStationStreamShow(() => 0.999);
  assert.equal(quietStream.id, STATION_STREAM_SHOW_ID);
  assert.equal(quietStream.title, 'AceRadio Live Broadcast');
  assert.equal(quietStream.listeners, 50);
  assert.equal(busyStream.listeners, 1999);
  assert.ok(busyStream.listeners <= 2000);
  assert.equal(createStationStreamShow(() => 1).listeners, 2000);
});

test('every explicitly selected show, including offline previews, is playable', () => {
  for (const show of shows) assert.equal(selectShow(shows, show.id, midmorningSlot), show);
  const offline = shows.filter(show => !isShowLive(show, midmorningSlot));
  assert.equal(selectShow(offline, undefined, midmorningSlot), getNextScheduledShow(offline, midmorningSlot).show, 'Station playback remains available and falls back to the next scheduled show');
  assert.equal(selectShow([], undefined, midmorningSlot), null);
});

test('previous and next follow the current scheduled lineup', () => {
  for (let index = 0; index < live.length; index++) {
    assert.equal(selectAdjacentLiveShow(shows, live[index].id, 1, midmorningSlot), live[index]);
    assert.equal(selectAdjacentLiveShow(shows, live[index].id, -1, midmorningSlot), live[index]);
  }
  assert.equal(selectAdjacentLiveShow(shows, shows[0].id, 1, midmorningSlot), live[0]);
  assert.equal(selectAdjacentLiveShow(shows, undefined, -1, midmorningSlot), live[0]);
  assert.equal(selectAdjacentLiveShow(shows, undefined, 1, morningSlot), shows[0]);
  assert.equal(selectAdjacentLiveShow([], undefined, 1, midmorningSlot), null);
});

test('no audio connection starts before Play; real media events determine playback', t => {
  const pending = deferred();
  const { player, sessions } = harness(t, { playPromise: pending.promise });
  assert.equal(player.getSnapshot().phase, 'idle');
  assert.equal(sessions.length, 0);
  player.start(metadata(live[0]));
  assert.equal(sessions[0].source, url);
  assert.equal(player.getSnapshot().phase, 'loading');
  pending.resolve();
  assert.equal(player.getSnapshot().phase, 'loading', 'A play request alone is not audible playback');
  sessions[0].notify({ phase: 'playing' });
  assert.equal(player.getSnapshot().phase, 'playing');
});

test('rapid show changes reuse one stream with no pause or loading flicker', t => {
  const { player, sessions } = harness(t);
  player.start(metadata(live[0]));
  sessions[0].notify({ phase: 'playing' });
  for (const show of shows) {
    player.start(metadata(show));
    assert.equal(player.getSnapshot().phase, 'playing');
  }
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].plays, 1);
  assert.equal(sessions[0].disposed, false);
  assert.equal(sessions[0].details.title, shows.at(-1).title);
});

test('changes during loading retain a single pending connection', t => {
  const { player, sessions } = harness(t);
  shows.forEach(show => player.start(metadata(show)));
  assert.equal(sessions.length, 1);
  assert.equal(player.getSnapshot().phase, 'loading');
  sessions[0].notify({ phase: 'playing' });
  assert.equal(player.getSnapshot().phase, 'playing');
  assert.equal(sessions[0].details.title, shows.at(-1).title);
});

test('unavailable system metadata and cleanup errors cannot break playback controls', t => {
  let notify;
  const player = new RadioPlayback(url, (_url, _details, onStatus) => {
    notify = onStatus;
    return {
      play() {},
      setMetadata() { throw new Error('System media controls unavailable'); },
      dispose() { throw new Error('System already released the player'); },
    };
  });
  t.after(() => player.dispose());
  player.start(metadata(live[0]));
  notify({ phase: 'playing' });
  assert.doesNotThrow(() => player.start(metadata(shows[0])));
  assert.equal(player.getSnapshot().phase, 'playing');
  assert.doesNotThrow(() => player.pause());
  assert.equal(player.getSnapshot().phase, 'paused');
  notify({ phase: 'playing' });
  assert.equal(player.getSnapshot().phase, 'paused');
});

test('cancel loading releases the stream and ignores late media events and rejected play', async t => {
  const pending = deferred();
  const { player, sessions } = harness(t, { playPromise: pending.promise });
  player.start(metadata(shows[0]));
  player.pause();
  assert.equal(sessions[0].disposed, true);
  sessions[0].notify({ phase: 'playing' });
  pending.reject(new Error('Aborted playback'));
  await Promise.resolve();
  assert.equal(player.getSnapshot().phase, 'paused');
  assert.equal(player.getSnapshot().error, null);
});

test('pause/resume makes a fresh live connection while keeping offline show details', t => {
  const { player, sessions } = harness(t);
  const details = metadata(shows[0]);
  player.start(details);
  sessions[0].notify({ phase: 'playing' });
  player.pause();
  player.start(details);
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].disposed, true);
  assert.equal(sessions[1].source, url);
  assert.equal(sessions[1].details, details);
  sessions[0].notify({ phase: 'error', error: 'stale' });
  assert.equal(player.getSnapshot().phase, 'loading');
  assert.equal(player.getSnapshot().error, null);
});

test('connection errors release resources; retry ignores all older callbacks', t => {
  const { player, sessions } = harness(t);
  player.start(metadata(live[0]));
  sessions[0].notify({ phase: 'error', error: STREAM_ERROR_MESSAGE });
  assert.equal(sessions[0].disposed, true);
  assert.equal(player.getSnapshot().phase, 'error');
  assert.equal(player.getSnapshot().error, STREAM_ERROR_MESSAGE);
  player.start(metadata(live[0]), true);
  sessions[0].notify({ phase: 'playing' });
  assert.equal(player.getSnapshot().phase, 'loading');
  sessions[1].notify({ phase: 'playing' });
  assert.equal(player.getSnapshot().phase, 'playing');
  assert.equal(player.getSnapshot().error, null);
});

test('rejected play requests and synchronous setup failures become recoverable errors', async t => {
  const { player } = harness(t, { playPromise: Promise.reject(new Error('No network')) });
  player.start(metadata(live[0]));
  await Promise.resolve();
  assert.equal(player.getSnapshot().phase, 'error');
  const broken = new RadioPlayback(url, () => { throw new Error('Setup failed'); });
  t.after(() => broken.dispose());
  assert.doesNotThrow(() => broken.start(metadata(live[0])));
  assert.equal(broken.getSnapshot().phase, 'error');
});

test('buffering and lock-screen interruptions are reflected without constant rerenders', t => {
  const { player, sessions } = harness(t);
  let updates = 0;
  player.subscribe(() => updates++);
  player.start(metadata(live[0]));
  sessions[0].notify({ phase: 'playing' });
  sessions[0].notify({ phase: 'playing' });
  assert.equal(updates, 2, 'Repeated progress updates leave shared context unchanged');
  sessions[0].notify({ phase: 'loading' });
  assert.equal(player.getSnapshot().phase, 'loading');
  sessions[0].notify({ phase: 'playing' });
  sessions[0].notify({ phase: 'paused' });
  assert.equal(player.getSnapshot().phase, 'paused');
});

test('stalled loading expires instead of spinning forever', async t => {
  const { player, sessions } = harness(t, { timeout: 15 });
  player.start(metadata(live[0]));
  sessions[0].notify({ phase: 'loading' });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(player.getSnapshot().phase, 'error');
  assert.match(player.getSnapshot().error, /taking too long/);
  assert.equal(sessions[0].disposed, true);
});

test('native setup cannot start after cancellation; latest metadata wins before setup finishes', async () => {
  const ready = deferred();
  const calls = [];
  let listener;
  const nativePlayer = {
    addListener(name, callback) { listener = callback; return { remove() { calls.push('unsubscribe'); } }; },
    replace(source) { calls.push(['source', source.uri]); },
    setActiveForLockScreen(active, details, options) { calls.push(['lock', details?.title, options?.isLiveStream]); },
    play() { calls.push('play'); }, pause() { calls.push('pause'); }, remove() { calls.push('remove'); }, release() { calls.push('release'); },
  };
  const { createRadioTransport } = loadModule('src/services/radioTransport.ts', {
    'expo': { isRunningInExpoGo: () => false },
    'expo-audio': { createAudioPlayer: () => nativePlayer, setAudioModeAsync: () => ready.promise },
    '@/utils/RadioPlayback': playbackModule,
  });
  const states = [];
  const cancelled = createRadioTransport(url, metadata(live[0]), status => states.push(status));
  const cancelledPlay = cancelled.play();
  cancelled.dispose();
  ready.resolve();
  await cancelledPlay;
  assert.equal(calls.includes('play'), false);
  assert.equal(calls.includes('release'), true, 'Cancellation explicitly releases native stream resources');
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'source'), false);
  const active = createRadioTransport(url, metadata(live[0]), status => states.push(status));
  active.setMetadata(metadata(shows[0]));
  await active.play();
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'source' && call[1] === url));
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'lock' && call[1] === shows[0].title && call[2]));
  listener({ isBuffering: true, isLoaded: false, playing: true });
  assert.equal(states.at(-1).phase, 'loading');
  listener({ isBuffering: false, isLoaded: true, playing: true });
  assert.equal(states.at(-1).phase, 'playing');
  listener({ isBuffering: false, isLoaded: true, playing: false });
  assert.equal(states.at(-1).phase, 'paused');
  listener({ error: 'Connection lost' });
  assert.equal(states.at(-1).phase, 'error');
  active.dispose();
});

test('Expo Go plays station audio without requesting unavailable background or lock-screen services', async () => {
  const calls = [];
  let listener;
  let audioMode;
  let lockRequests = 0;
  const nativePlayer = {
    addListener(name, callback) { listener = callback; return { remove() { calls.push('unsubscribe'); } }; },
    replace(source) { calls.push(['source', source.uri]); },
    setActiveForLockScreen() { lockRequests++; },
    play() { calls.push('play'); }, pause() { calls.push('pause'); }, remove() { calls.push('remove'); }, release() { calls.push('release'); },
  };
  const { createRadioTransport } = loadModule('src/services/radioTransport.ts', {
    'expo': { isRunningInExpoGo: () => true },
    'expo-audio': {
      createAudioPlayer: () => nativePlayer,
      setAudioModeAsync: async mode => { audioMode = mode; },
    },
    '@/utils/RadioPlayback': playbackModule,
  });
  const states = [];
  const transport = createRadioTransport(url, metadata(live[0]), state => states.push(state));
  await transport.play();
  transport.setMetadata(metadata(shows[0]));
  listener({ isBuffering: false, isLoaded: true, playing: true });
  assert.equal(states.at(-1).phase, 'playing');
  assert.equal(audioMode.shouldPlayInBackground, false);
  assert.equal(audioMode.playsInSilentMode, true);
  assert.equal(audioMode.interruptionMode, 'doNotMix');
  assert.equal(calls.filter(call => call === 'play').length, 1);
  assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'source' && call[1] === url));
  transport.dispose();
  assert.equal(lockRequests, 0, 'Play, metadata changes and cleanup all skip the unavailable service');
  assert.equal(calls.includes('release'), true, 'Foreground playback still releases its native resources');
});

test('configured native development and release builds retain background playback and live lock-screen controls', async () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
  const audioPlugin = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-audio');
  assert.equal(audioPlugin[1].enableBackgroundPlayback, true, 'The native build declares the playback service');
  const locks = [];
  let audioMode;
  const nativePlayer = {
    addListener() { return { remove() {} }; }, replace() {}, play() {}, pause() {}, remove() {}, release() {},
    setActiveForLockScreen(active, details, options) { locks.push({ active, details, options }); },
  };
  const { createRadioTransport } = loadModule('src/services/radioTransport.ts', {
    // Expo's native ExpoGo-module check returns false in our own dev client too.
    'expo': { isRunningInExpoGo: () => false },
    'expo-audio': { createAudioPlayer: () => nativePlayer, setAudioModeAsync: async mode => { audioMode = mode; } },
    '@/utils/RadioPlayback': playbackModule,
  });
  const transport = createRadioTransport(url, metadata(live[0]), () => {});
  await transport.play();
  assert.equal(audioMode.shouldPlayInBackground, true);
  assert.equal(locks[0].active, true);
  assert.equal(locks[0].options.isLiveStream, true);
  assert.equal(locks[0].options.showSeekForward, false);
  assert.equal(locks[0].options.showSeekBackward, false);
  transport.setMetadata(metadata(shows[0]));
  assert.equal(locks.at(-1).details.title, shows[0].title);
  transport.dispose();
  assert.equal(locks.at(-1).active, false);
});
