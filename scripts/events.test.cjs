const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createClient } = require('@supabase/supabase-js');
const { QueryClient } = require('@tanstack/react-query');
const root = path.resolve(__dirname, '..');
function load(relative, imports = {}, globals = {}) {
  const filename = path.join(root, relative), exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new vm.Script(code, { filename }).runInNewContext({ exports, AbortController, setTimeout, clearTimeout, ...globals, require(name) {
    if (Object.hasOwn(imports, name)) return imports[name];
    if (name === 'zod') return require('zod');
    throw Error('Unexpected import: ' + name);
  } });
  return exports;
}
const id = number => `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const row = (number = 1, overrides = {}) => ({ id: id(number), title: 'Verified station event', description: 'Published details.\nSecond paragraph.',
  starts_at: '2026-11-29T07:00:00+00:00', ends_at: '2026-11-29T20:00:00+00:00',
  location: 'Verified venue', image_url: null, booking_url: null, status: 'published', ...overrides });
const config = { contentConfig: { source: 'supabase', url: 'https://test.supabase.co' } };
function repository(fetcher = async () => { throw Error('Unexpected network call'); }, globals = {}) {
  const client = createClient(config.contentConfig.url, 'sb_publishable_test', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return load('src/services/eventsRepository.ts', { '@/services/supabase': { getSupabaseClient: () => client }, '@/config/content': config }, globals);
}
const repo = repository();
const calendar = load('src/utils/events.ts');
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('published event mapping preserves supplied text and optional values; no artwork or booking URL is invented', () => {
  const event = repo.decodeEvent(row());
  assert.equal(event.title, row().title); assert.equal(event.description, row().description);
  assert.equal(event.imageUrl, null); assert.equal(event.bookingUrl, null);
  assert.equal(event.startsAt, row().starts_at); assert.equal(event.location, row().location);
  assert.equal(repo.decodeEvent(null), null);
  for (const url of ['javascript:alert(1)', 'http://unsafe.test', '/relative/path', '']) {
    const safe = repo.decodeEvent(row(1, { image_url: url, booking_url: url }));
    assert.equal(safe.imageUrl, null); assert.equal(safe.bookingUrl, null);
  }
  const linked = repo.decodeEvent(row(1, { image_url: 'https://cdn.example.test/poster.png', booking_url: 'https://ace.radio/events/book' }));
  assert.equal(linked.imageUrl, 'https://cdn.example.test/poster.png'); assert.equal(linked.bookingUrl, 'https://ace.radio/events/book');
});

test('network and restored-cache validation reject drafts, malformed records and invalid date ranges', () => {
  for (const bad of [row(1, { status: 'draft' }), row(1, { status: 'cancelled' }), row(1, { starts_at: '29 November' }),
    row(1, { ends_at: '2020-01-01T00:00:00Z' }), row(1, { title: ' ' }), row(1, { id: 'not-an-id' })]) assert.throws(() => repo.decodeEvents([bad]));
  assert.equal(repo.validEventId(id(1)), true); assert.equal(repo.validEventId('not-an-id'), false);
});

test('upcoming/ongoing/past boundaries and ordering expire cached events without inventing an unknown end time', () => {
  const events = repo.decodeEvents([row(3, { starts_at: '2026-11-30T07:00:00Z', ends_at: null }), row(2), row(1, { starts_at: '2026-11-28T07:00:00Z', ends_at: null })]);
  const before = Date.parse('2026-11-29T06:59:59Z');
  assert.deepEqual(Array.from(calendar.upcomingEvents(events, before), e => e.id), [id(2), id(3)]);
  const event = events[1];
  assert.equal(calendar.eventPhase(event, Date.parse(event.startsAt) - 1), 'upcoming');
  assert.equal(calendar.eventPhase(event, Date.parse(event.startsAt)), 'live');
  assert.equal(calendar.eventPhase(event, Date.parse(event.endsAt) - 1), 'live');
  assert.equal(calendar.eventPhase(event, Date.parse(event.endsAt)), 'past');
  assert.equal(calendar.eventPhase(events[2], Date.parse(events[2].startsAt)), 'past');
  assert.equal(calendar.upcomingEvents(events, Date.parse('2099-01-01T00:00:00Z')).length, 0);
});

test('event dates always render in SAST, including midnight crossings and unknown end times', () => {
  assert.match(calendar.eventSchedule(repo.decodeEvent(row())), /29 Nov 2026.*09:00–22:00 SAST/);
  assert.match(calendar.eventSchedule(repo.decodeEvent(row(1, { starts_at: '2026-11-29T21:00:00Z', ends_at: '2026-11-29T23:00:00Z' }))), /29 Nov 2026, 23:00.*30 Nov 2026, 01:00 SAST/);
  const single = calendar.eventSchedule(repo.decodeEvent(row(1, { ends_at: null })));
  assert.match(single, /09:00 SAST/); assert.ok(!single.includes('22:00'));
});

test('production upcoming query uses anonymous published-only reads, future/ongoing filters and stable pagination', async () => {
  const requests = [];
  const transport = repository(async (url, options) => {
    const query = new URL(url); requests.push(query);
    assert.equal(query.pathname, '/rest/v1/events'); assert.equal(options.method, 'GET');
    assert.equal(new Headers(options.headers).get('apikey'), 'sb_publishable_test');
    assert.equal(query.searchParams.get('status'), 'eq.published');
    assert.match(query.searchParams.get('or'), /ends_at\.gt\..*and\(ends_at\.is\.null,starts_at\.gte\./);
    assert.equal(query.searchParams.get('order'), 'starts_at.asc,id.asc');
    assert.equal(query.searchParams.get('limit'), '100');
    assert.ok(!query.searchParams.get('select').includes('guest'));
    const offset = Number(query.searchParams.get('offset'));
    if (!offset) return json(Array.from({ length: 100 }, (_, i) => row(i + 1)));
    assert.equal(offset, 100); return json([row(100), row(101)]);
  });
  const events = await transport.fetchUpcomingEvents(new AbortController().signal);
  assert.equal(requests.length, 2); assert.equal(events.length, 101); assert.equal(new Set(events.map(e => e.id)).size, 101);
});

test('direct event reads require published status and a missing/unpublished event becomes unavailable', async () => {
  const transport = repository(async (url, options) => {
    const query = new URL(url); assert.equal(options.method, 'GET');
    assert.equal(query.searchParams.get('status'), 'eq.published');
    const eventId = query.searchParams.get('id');
    return json(eventId === 'eq.' + id(1) ? [row()] : []);
  });
  assert.equal((await transport.fetchEvent(id(1), new AbortController().signal)).title, row().title);
  assert.equal(await transport.fetchEvent(id(2), new AbortController().signal), null);
});

test('concurrent event consumers share a request and failed refreshes retain validated public content', async () => {
  let calls = 0, fail = false;
  const transport = repository(async () => { calls++; return fail ? json({ message: 'Unavailable' }, 503) : json([row()]); });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  try {
    const options = { queryKey: transport.upcomingEventsKey, queryFn: ({ signal }) => transport.fetchUpcomingEvents(signal) };
    const [first, second] = await Promise.all([cache.fetchQuery(options), cache.fetchQuery(options)]);
    assert.equal(calls, 1); assert.strictEqual(first, second);
    fail = true; await assert.rejects(cache.fetchQuery(options), /Unable to update events/);
    assert.equal(transport.decodeEvents(cache.getQueryData(options.queryKey))[0].id, id(1));
  } finally { cache.clear(); }
});

test('caller cancellation and the overall request deadline abort pending event requests', async () => {
  let aborted = 0;
  const fetcher = (_url, options) => new Promise((_resolve, reject) => {
    const abort = () => { aborted++; reject(new DOMException('Aborted', 'AbortError')); };
    if (options.signal.aborted) abort(); else options.signal.addEventListener('abort', abort, { once: true });
  });
  const transport = repository(fetcher);
  const controller = new AbortController(); const pending = transport.fetchUpcomingEvents(controller.signal); controller.abort();
  await assert.rejects(pending, /Unable to update events/);
  const short = repository(fetcher, { setTimeout: callback => setTimeout(callback, 5) });
  await assert.rejects(short.fetchUpcomingEvents(new AbortController().signal), /Unable to update events/);
  assert.equal(aborted, 2);
});
