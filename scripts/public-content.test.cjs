const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  ts = require("typescript");
const { createHash, webcrypto } = require("node:crypto");
const { PGlite } = require("@electric-sql/pglite");
const root = path.resolve(__dirname, "..");
function load(file, imports = {}, extras = {}) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  new vm.Script(code, { filename: file }).runInNewContext({
    exports,
    AbortController,
    AbortSignal,
    URL,
    Request,
    Response,
    TextEncoder,
    TextDecoder,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    Date,
    ...extras,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), "Unexpected import " + name);
      return imports[name];
    },
  });
  return exports;
}
const core = load("src/services/publicSnapshotClient.ts");
const shared = load("supabase/functions/_shared/publicSnapshot.ts");
const publisher = load("supabase/functions/content-publish/handler.ts", {
  "../_shared/publicSnapshot.ts": shared,
});
const readers = load("supabase/functions/_shared/readPublicSnapshot.ts", {
  "./publicSnapshot.ts": shared,
});
const endpoint = load("supabase/functions/public-content/handler.ts");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const clock = Date.parse("2026-10-22T12:00:00Z");
const emptyStation = () => ({
  version: 3,
  shows: [],
  presenters: [],
  show_presenters: [],
  show_schedules: [],
  media_assets: [],
  banners: [],
  announcements: [],
});
const source = () => ({
  revision: 1,
  app: emptyStation(),
  events: [],
  website: { station: emptyStation(), events: [], tickets: [] },
});
const body = () => JSON.stringify(shared.compileSnapshot(source()));
const pointer = (text = body(), extra = {}) => ({
  version: 1,
  sha256: hash(text),
  path: `public-content/v1/${hash(text)}.json`,
  revision: 1,
  checked_at: new Date(clock).toISOString(),
  next_transition: null,
  ...extra,
});
const json = (value, headers = {}) =>
  new Response(JSON.stringify(value), {
    headers: {
      "content-type": "application/json",
      date: new Date(clock).toUTCString(),
      ...headers,
    },
  });

test("publisher storage adapter preserves strong conditional tags for compressed R2 JSON", async () => {
  let adapter;
  const requests = [];
  load(
    "supabase/functions/content-publish/index.ts",
    {
      "npm:@supabase/supabase-js@2.117.3": { createClient: () => ({}) },
      "npm:aws4fetch@1.0.20": {
        AwsClient: class {
          sign(url, options) {
            return new Request(url, options);
          }
        },
      },
      "../_shared/r2.ts": { createR2Store: () => ({}) },
      "../_shared/publicSnapshot.ts": shared,
      "./handler.ts": {
        createContentPublishHandler: (options) => {
          adapter = options;
          return () => {};
        },
      },
    },
    {
      Deno: { env: { get: () => "https://storage.example" }, serve() {} },
      fetch: async (request) => {
        requests.push(request);
        return request.method === "GET"
          ? json(pointer(), { etag: 'W/"storage-version"' })
          : new Response(null, { status: 200 });
      },
    },
  );
  const current = await adapter.readPointer();
  assert.equal(current.etag, '"storage-version"');
  assert.equal(requests[0].headers.get("accept-encoding"), "identity");
  await adapter.putPointer(current.value, current.etag);
  assert.equal(requests[1].headers.get("if-match"), '"storage-version"');
});
function clientFixture(fetcher) {
  let time = clock,
    disk = null,
    writes = 0,
    calls = [];
  const get = () =>
    core.createPublicSnapshotClient({
      url: "https://images.test/public-content/v1/current.json",
      mode: "pointer",
      now: () => time,
      hash: async (text) => hash(text),
      read: async () => disk,
      write: async (value) => {
        disk = value;
        writes++;
      },
      fetch: async (url, options) => {
        calls.push({ url, options });
        return fetcher(url, options, calls.length, time);
      },
    });
  return {
    get,
    calls,
    get disk() {
      return disk;
    },
    get writes() {
      return writes;
    },
    advance(ms) {
      time += ms;
    },
    setDisk(value) {
      disk = value;
    },
  };
}
test("public snapshot cache coalesces catalogue/events, reuses unchanged bytes and restores verified disk data", async () => {
  const f = clientFixture(async (url) =>
    url.endsWith("current.json")
      ? json(pointer(), { etag: '"pointer"' })
      : new Response(body()),
  );
  const cache = f.get(),
    a = new AbortController(),
    b = new AbortController();
  const values = await Promise.all([cache.get(a.signal), cache.get(b.signal)]);
  assert.equal(f.calls.length, 2);
  assert.equal(f.writes, 1);
  assert.equal(values[0].version, 1);
  await cache.get(a.signal);
  assert.equal(f.calls.length, 2);
  f.advance(60000);
  await cache.get(a.signal);
  assert.equal(
    f.calls.length,
    3,
    "Unchanged hash must not download JSON again",
  );
  await f.get().get(a.signal);
  assert.equal(
    f.calls.length,
    3,
    "Verified disk cache survives process restart",
  );
});
test("a cancelled consumer cannot cancel the shared refresh needed by another screen", async () => {
  let unblock;
  const gate = new Promise((resolve) => (unblock = resolve));
  const f = clientFixture(async (url) => {
    await gate;
    return url.endsWith("current.json")
      ? json(pointer())
      : new Response(body());
  });
  const c = f.get(),
    a = new AbortController(),
    b = new AbortController();
  const cancelled = c.get(a.signal),
    active = c.get(b.signal);
  a.abort();
  unblock();
  await assert.rejects(cancelled, { name: "AbortError" });
  assert.equal((await active).version, 1);
  assert.equal(f.calls.length, 2);
});
test("network errors and Retry-After prevent manual-refresh/request storms", async () => {
  const f = clientFixture(
    async () =>
      new Response(null, { status: 429, headers: { "retry-after": "90" } }),
  );
  const c = f.get(),
    signal = new AbortController().signal;
  await assert.rejects(c.get(signal));
  for (let i = 0; i < 20; i++) await assert.rejects(c.get(signal));
  assert.equal(f.calls.length, 1);
  f.advance(89999);
  await assert.rejects(c.get(signal));
  assert.equal(f.calls.length, 1);
  f.advance(1);
  await assert.rejects(c.get(signal));
  assert.equal(f.calls.length, 2);
});
test("hash mismatches, traversal pointers, oversized responses and corrupted disk entries cannot be promoted", async () => {
  for (const mode of ["hash", "traversal", "oversize"]) {
    const f = clientFixture(async (url) =>
      url.endsWith("current.json")
        ? json(
            pointer(
              body(),
              mode === "traversal" ? { path: "https://evil.test/secret" } : {},
            ),
          )
        : new Response(mode === "hash" ? "corrupt" : body(), {
            headers: mode === "oversize" ? { "content-length": "1048577" } : {},
          }),
    );
    await assert.rejects(f.get().get(new AbortController().signal));
    assert.equal(f.writes, 0);
    if (mode === "traversal") assert.equal(f.calls.length, 1);
  }
  const f = clientFixture(async (url) =>
    url.endsWith("current.json") ? json(pointer()) : new Response(body()),
  );
  f.setDisk(
    JSON.stringify({
      version: 1,
      body: "corrupt",
      hash: hash(body()),
      fetchedAt: clock,
    }),
  );
  await f.get().get(new AbortController().signal);
  assert.equal(f.calls.length, 2);
});
test("native fetch without body streaming is supported and expired publisher heartbeats are rejected", async () => {
  let calls = 0;
  const c = core.createPublicSnapshotClient({
    url: "https://images.test/current.json",
    mode: "proxy",
    now: () => clock,
    hash: async (t) => hash(t),
    read: async () => null,
    write: async () => {},
    fetch: async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        body: null,
        headers: new Headers(),
        text: async () => body(),
      };
    },
  });
  assert.equal((await c.get(new AbortController().signal)).version, 1);
  assert.equal(calls, 1);
  const f = clientFixture(async () =>
    json(
      pointer(body(), {
        checked_at: new Date(clock - 16 * 60000).toISOString(),
      }),
    ),
  );
  await assert.rejects(f.get().get(new AbortController().signal));
  assert.equal(f.calls.length, 1);
});
test("public export allowlists exclude private fields, source payloads and unrelated account/booking data", () => {
  const s = source();
  s.accounts = [{ email: "private@example.test" }];
  s.app.shows = [
    {
      id: "show",
      title: "Published",
      source_payload: { email: "private" },
      password: "secret",
    },
  ];
  s.website.bookings = [{ email: "private" }];
  s.website.tickets = [
    { id: "ticket", name: "Public", price_cents: 200, guest_email: "private" },
  ];
  const output = JSON.stringify(shared.compileSnapshot(s));
  assert.ok(
    !output.includes("private") &&
      !output.includes("password") &&
      !output.includes("source_payload") &&
      !output.includes("bookings"),
  );
  assert.ok(output.includes("Published") && output.includes("price_cents"));
});
test("new app catalogue and event reads use the public snapshot without calling Supabase", async () => {
  const event = {
    id: "20000000-0000-4000-8000-000000000001",
    title: "Published event",
    description: "Details",
    starts_at: "2099-01-01T12:00:00+00:00",
    ends_at: null,
    location: null,
    image_url: "https://images.test/event.jpg",
    booking_url: null,
    status: "published",
  };
  const value = {
    version: 1,
    app: emptyStation(),
    events: [event],
    website: {},
  };
  let calls = 0;
  const imports = {
    zod: require("zod"),
    "@/services/supabase": {
      getSupabaseClient() {
        throw Error("Database must not be called");
      },
    },
    "@/config/content": {
      contentConfig: { source: "supabase", url: "https://test.supabase.co" },
    },
    "@/services/publicSnapshot": {
      publicSnapshotEnabled: () => true,
      readPublicSnapshot: async () => {
        calls++;
        return value;
      },
    },
    "@/utils/showSchedule": load("src/utils/showSchedule.ts"),
  };
  const content = load("src/services/contentRepository.ts", imports),
    events = load("src/services/eventsRepository.ts", imports);
  const signal = new AbortController().signal;
  assert.equal((await content.fetchAppContent(signal)).version, 3);
  assert.equal((await events.fetchUpcomingEvents(signal))[0].id, event.id);
  assert.equal((await events.fetchEvent(event.id, signal)).id, event.id);
  assert.equal(
    await events.fetchEvent("20000000-0000-4000-8000-000000000099", signal),
    null,
  );
  assert.equal(calls, 4);
});
test("publisher rejects unauthorised calls before DB access and honours the global lease", async () => {
  let calls = 0;
  const handler = publisher.createContentPublishHandler({
    secret: "a".repeat(64),
    claim: async () => {
      calls++;
      return { allowed: false };
    },
  });
  assert.equal(
    (await handler(new Request("https://test", { method: "POST" }))).status,
    401,
  );
  assert.equal(calls, 0);
  const r = await handler(
    new Request("https://test", {
      method: "POST",
      headers: { authorization: "Bearer " + "a".repeat(64) },
    }),
  );
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "55");
  assert.equal(calls, 1);
});
test("unchanged publisher revisions update only the heartbeat; failed immutable writes keep the previous pointer", async () => {
  const token = "a".repeat(64);
  let loads = 0,
    puts = 0,
    pointers = [];
  const deps = {
    secret: token,
    now: () => clock,
    claim: async () => ({ allowed: true, revision: 1, next_transition: null }),
    load: async () => {
      loads++;
      return source();
    },
    readPointer: async () => ({ value: pointer(), etag: "old" }),
    putImmutable: async () => {
      puts++;
    },
    putPointer: async (p, e) => pointers.push({ p, e }),
  };
  const req = () =>
    new Request("https://test", {
      method: "POST",
      headers: { authorization: "Bearer " + token },
    });
  assert.equal(
    (await publisher.createContentPublishHandler(deps)(req())).status,
    200,
  );
  assert.equal(loads, 0);
  assert.equal(puts, 0);
  assert.equal(pointers.length, 1);
  assert.equal(pointers[0].e, "old");
  pointers = [];
  const fail = publisher.createContentPublishHandler({
    ...deps,
    claim: async () => ({ allowed: true, revision: 2 }),
    putImmutable: async () => {
      throw Error("provider failed");
    },
  });
  assert.equal((await fail(req())).status, 503);
  assert.equal(pointers.length, 0);
});
test("reader caches/coalesces R2 requests, validates bytes and never needs a database", async () => {
  let calls = 0,
    time = clock;
  const read = readers.createSnapshotReader(
    "https://images.test",
    async (url) => {
      calls++;
      return String(url).endsWith("current.json")
        ? json(pointer())
        : new Response(body());
    },
    () => time,
  );
  await Promise.all(Array.from({ length: 20 }, () => read()));
  assert.equal(calls, 2);
  time += 60000;
  await read();
  assert.equal(calls, 3);
});
test("browser read endpoint supports CORS/ETag/HEAD and returns bounded rate-limit responses before loading", async () => {
  let time = clock,
    reads = 0;
  const serve = endpoint.createPublicContentHandler(
    async () => {
      reads++;
      return { hash: hash(body()), bytes: new TextEncoder().encode(body()) };
    },
    () => time,
    2,
  );
  assert.equal(
    (await serve(new Request("https://test", { method: "OPTIONS" }))).status,
    204,
  );
  assert.equal(reads, 0);
  const first = await serve(new Request("https://test"));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("access-control-allow-origin"), "*");
  const next = await serve(
    new Request("https://test", {
      headers: { "if-none-match": first.headers.get("etag") },
    }),
  );
  assert.equal(next.status, 304);
  assert.equal(await next.text(), "");
  const blocked = await serve(new Request("https://test"));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("retry-after"), "60");
  assert.equal(reads, 2);
  time += 60000;
  const head = await serve(new Request("https://test", { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("weak gzip gateway ETags are verified and produce a body-free conditional response", async () => {
  const digest = hash(body());
  const cache = core.createPublicSnapshotClient({
    url: "https://public.test/content",
    mode: "proxy",
    now: () => clock,
    hash: async (text) => hash(text),
    read: async () => null,
    write: async () => {},
    fetch: async () =>
      new Response(body(), { headers: { etag: `W/"${digest}"` } }),
  });
  assert.equal((await cache.get(new AbortController().signal)).version, 1);
  const serve = endpoint.createPublicContentHandler(async () => ({
    bytes: new TextEncoder().encode(body()),
    hash: digest,
  }));
  const response = await serve(
    new Request("https://public.test/content", {
      headers: { "If-None-Match": `W/"${digest}"` },
    }),
  );
  assert.equal(response.status, 304);
  assert.equal(await response.text(), "");
});

let db;
const editor = "10000000-0000-4000-8000-000000000001",
  ordinary = "10000000-0000-4000-8000-000000000002";
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema app_private;
 create table auth.users(id uuid primary key);insert into auth.users values('${editor}'),('${ordinary}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create function public.is_content_editor() returns boolean language sql stable as $$select auth.uid()='${editor}'::uuid and current_setting('request.jwt.claim.aal',true)='aal2'$$;
 create table app_private.account_rate_limits(user_id uuid references auth.users,action text,hits integer not null default 0,window_start timestamptz not null default now(),primary key(user_id,action));
 create function public.get_app_content_v3() returns jsonb language sql stable as $$select '{}'::jsonb$$;
 create function public.get_website_content() returns jsonb language sql stable as $$select '{}'::jsonb$$;`);
  const original = fs.readFileSync(
    path.join(root, "supabase/migrations/20261016100000_accounts_and_sync.sql"),
    "utf8",
  );
  const start = original.indexOf("create function app_private.account_limit("),
    end = original.indexOf(
      "revoke all on function app_private.account_limit",
      start,
    );
  await db.exec(original.slice(start, end));
  for (const table of [
    "shows",
    "presenters",
    "show_presenters",
    "show_schedules",
    "media_assets",
    "banners",
    "announcements",
    "events",
    "event_ticket_types",
  ]) {
    await db.exec(
      `create table public.${table}(id uuid primary key default gen_random_uuid(),status text default 'published',starts_at timestamptz,ends_at timestamptz,title text default '',description text default '',location text,image_url text,booking_url text);`,
    );
  }
  await db.exec(
    fs.readFileSync(
      path.join(
        root,
        "supabase/migrations/20261022160000_public_content_delivery.sql",
      ),
      "utf8",
    ),
  );
});
after(async () => {
  await db?.close();
});
test("private publisher state is inaccessible, credentials are mandatory and a global lease paces all instances", async () => {
  await db.exec("begin;set local role anon;");
  await assert.rejects(
    db.query("select * from app_private.public_content_delivery"),
  );
  await db.exec("rollback");
  await assert.rejects(
    db.query("select public.claim_public_content_publish('bad')"),
  );
  const token = "a".repeat(64);
  await db.query(
    "update app_private.public_content_delivery set publisher_sha256=$1",
    [hash(token)],
  );
  const first = (
    await db.query("select public.claim_public_content_publish($1) as result", [
      token,
    ])
  ).rows[0].result;
  const second = (
    await db.query("select public.claim_public_content_publish($1) as result", [
      token,
    ])
  ).rows[0].result;
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  await assert.rejects(db.query("select public.export_public_content('bad')"));
});
test("content revisions change for admin edits and upcoming publication boundaries remain visible to the publisher", async () => {
  const before = (
    await db.query("select revision from app_private.public_content_delivery")
  ).rows[0].revision;
  await db.exec(
    "insert into public.announcements(starts_at,ends_at) values(now()+interval '2 minutes',now()+interval '1 hour')",
  );
  const after = (
    await db.query("select revision from app_private.public_content_delivery")
  ).rows[0].revision;
  assert.equal(Number(after), Number(before) + 1);
  await db.exec(
    "update app_private.public_content_delivery set lease_until='-infinity'",
  );
  const p = (
    await db.query("select public.claim_public_content_publish($1) as result", [
      "a".repeat(64),
    ])
  ).rows[0].result;
  assert.ok(p.next_transition);
  assert.ok(Date.parse(p.next_transition) > Date.now());
});
test("upload limits enforce real staff/MFA and persist accepted quotas across requests without exposing the counter", async () => {
  const set = async (uid, aal) => {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false)",
      [uid, aal],
    );
  };
  await set(ordinary, "aal2");
  await assert.rejects(db.query("select public.reserve_media_upload()"));
  await set(editor, "aal1");
  await assert.rejects(db.query("select public.reserve_media_upload()"));
  await set(editor, "aal2");
  for (let i = 0; i < 20; i++)
    assert.equal(
      (await db.query("select public.reserve_media_upload() as allowed"))
        .rows[0].allowed,
      true,
    );
  assert.equal(
    (await db.query("select public.reserve_media_upload() as allowed")).rows[0]
      .allowed,
    false,
  );
  await db.exec(
    "update app_private.account_rate_limits set window_start=now()-interval '2 minutes' where action='media-upload-minute'",
  );
  assert.equal(
    (await db.query("select public.reserve_media_upload() as allowed")).rows[0]
      .allowed,
    true,
  );
  await db.exec(
    "update app_private.account_rate_limits set hits=120 where action='media-upload-hour'",
  );
  assert.equal(
    (await db.query("select public.reserve_media_upload() as allowed")).rows[0]
      .allowed,
    false,
  );
});
