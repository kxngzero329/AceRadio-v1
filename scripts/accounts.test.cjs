const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const { buildSeed } = require("./backend/seed.cjs");
const root = path.resolve(__dirname, "..");
let db;
const first = "20000000-0000-4000-8000-000000000001";
const second = "20000000-0000-4000-8000-000000000002";
const admin = "20000000-0000-4000-8000-000000000003";
const unverified = "20000000-0000-4000-8000-000000000004";
function load(relative, imports = {}, globals = {}) {
  const exports = {},
    filename = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  new vm.Script(output, { filename }).runInNewContext({
    exports,
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw Error("Unexpected import: " + name);
    },
    setTimeout,
    clearTimeout,
    AbortController,
    ...globals,
  });
  return exports;
}
const types = load("src/types/account.ts", { zod: require("zod") });
const { AccountSync, ACCOUNT_CACHE_AGE } = load("src/utils/AccountSync.ts", {
  zod: require("zod"),
  "@/types/account": types,
});
const { createChunkedStorage } = load("src/utils/chunkedStorage.ts");
async function as(uid, action, aal = "aal1", amr = []) {
  await db.query(
    "select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [uid ?? "", JSON.stringify({ sub: uid, aal, amr })],
  );
  await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
  try {
    return await action();
  } finally {
    await db.exec("reset role");
  }
}
const snapshot = () =>
  db
    .query("select public.get_account_data() as data")
    .then((result) => result.rows[0].data);
const write = (changes) =>
  db
    .query("select public.apply_account_changes($1::jsonb) as data", [
      JSON.stringify(changes),
    ])
    .then((result) => result.rows[0].data);
const change = (kind, value, base = 0, extra = {}) => ({
  id: randomUUID(),
  kind,
  value,
  base_revision: base,
  ...extra,
});
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
    create table auth.mfa_factors(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users on delete cascade,status text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
    grant select on storage.buckets to anon,authenticated,service_role;`);
  for (const file of fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .filter(
      (file) =>
        file.endsWith(".sql") && !file.endsWith("_public_content_delivery.sql"),
    )
    .sort())
    await db.exec(
      fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"),
    );
  await db.exec(buildSeed());
  for (const uid of [first, second, admin, unverified])
    await db.query(
      "insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values($1,$2,$3)",
      [
        uid,
        uid === unverified ? null : "2026-10-16T10:00:00Z",
        JSON.stringify({ display_name: "Test listener", role: "admin" }),
      ],
    );
  await db.query(
    "update public.user_roles set role = 'admin' where user_id = $1",
    [admin],
  );
});
after(async () => {
  await db?.close();
});

test("signup creates one private profile/settings/user role and ignores supplied admin metadata", async () => {
  for (const uid of [first, second, unverified])
    assert.equal(
      (
        await db.query("select role from public.user_roles where user_id=$1", [
          uid,
        ])
      ).rows[0].role,
      "user",
    );
  assert.equal(
    (await db.query("select to_regclass('app_private.content_staff') as old"))
      .rows[0].old,
    null,
  );
  await assert.rejects(
    db.query("update public.user_roles set role='editor' where user_id=$1", [
      first,
    ]),
    /check constraint/i,
  );
  for (const table of [
    "profiles",
    "user_roles",
    "user_settings",
    "user_favorites",
  ])
    assert.equal(
      (
        await db.query(
          "select rowsecurity from pg_tables where schemaname=$1 and tablename=$2",
          ["public", table],
        )
      ).rows[0].rowsecurity,
      true,
    );
});
test("anonymous and unverified users cannot access account RPCs or private rows", async () => {
  await assert.rejects(as(null, snapshot), /permission/i);
  await assert.rejects(as(unverified, snapshot), /verified email/i);
  await as(unverified, async () => {
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      0,
    );
  });
});
test("owner reads expose no other users, and all direct client writes/role escalation are denied", async () => {
  await as(first, async () => {
    const data = await snapshot();
    assert.equal(data.user_id, first);
    assert.equal(data.role, "user");
    assert.equal(
      (await db.query("select * from public.profiles")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.user_roles")).rows.length,
      1,
    );
    for (const sql of [
      "update public.user_roles set role='admin'",
      "update public.profiles set display_name='Intruder'",
      "delete from public.user_settings",
      "insert into public.user_favorites(user_id,show_id) values ('" +
        second +
        "','mornings')",
    ])
      await assert.rejects(db.exec(sql), /permission/i);
    await assert.rejects(
      db.exec("select * from app_private.account_operations"),
      /permission/i,
    );
  });
});
test("atomic writes save owner favourites/settings/name; duplicate operations and stale revisions are safe", async () => {
  await as(first, async () => {
    const favorite = change("favorite", true, 0, { show_id: "mornings" });
    const result = await write([
      favorite,
      change("settings", true),
      change("profile", "My name"),
    ]);
    assert.ok(result.results.every((row) => row.status === "saved"));
    assert.equal(result.account.profile.display_name, "My name");
    assert.equal(result.account.settings.notifications_enabled, true);
    assert.equal(result.account.favorites[0].revision, 1);
    assert.equal(
      (await write([favorite])).account.favorites[0].revision,
      1,
      "lost-response retry does not repeat a write",
    );
    assert.equal(
      (await write([change("favorite", false, 0, { show_id: "mornings" })]))
        .results[0].status,
      "conflict",
    );
    const removed = await write([
      change("favorite", false, 1, { show_id: "mornings" }),
    ]);
    assert.equal(removed.account.favorites[0].is_favorite, false);
    assert.equal(removed.account.favorites[0].revision, 2);
    assert.equal(
      (await write([change("favorite", true, 1, { show_id: "mornings" })]))
        .results[0].status,
      "conflict",
      "offline stale add cannot resurrect removal",
    );
  });
  await as(second, async () => {
    const data = await snapshot();
    assert.equal(data.favorites.length, 0);
    assert.equal(data.settings.notifications_enabled, false);
  });
});
test("invalid input rolls back the batch; unavailable shows cannot be added", async () => {
  await as(second, async () => {
    await assert.rejects(
      write([change("settings", true), change("profile", "\n")]),
      /display name/i,
    );
    assert.equal((await snapshot()).settings.revision, 0);
    assert.equal(
      (await write([change("favorite", true, 0, { show_id: "missing-show" })]))
        .results[0].status,
      "unavailable",
    );
    await assert.rejects(write([]), /Invalid changes/i);
    await assert.rejects(
      write(Array.from({ length: 51 }, () => change("settings", false))),
      /Invalid changes/i,
    );
    await assert.rejects(
      write([change("settings", "true")]),
      /Invalid preference/i,
    );
  });
});
test("server rate limits cannot be bypassed with direct RPCs and duplicates do not consume quota", async () => {
  await db.query(
    "insert into app_private.account_rate_limits(user_id,action,hits) values($1,'writes_minute',90) on conflict(user_id,action) do update set hits=90,window_start=now()",
    [second],
  );
  await assert.rejects(
    as(second, () => write([change("settings", true)])),
    /Too many changes/i,
  );
  await db.query(
    "update app_private.account_rate_limits set window_start=now()-interval '2 minutes' where user_id=$1 and action='writes_minute'",
    [second],
  );
  await as(second, async () => {
    const c = change("settings", true);
    await write([c]);
    await write([c]);
  });
  assert.equal(
    (
      await db.query(
        "select hits from app_private.account_rate_limits where user_id=$1 and action='writes_minute'",
        [second],
      )
    ).rows[0].hits,
    1,
  );
});
test("admin authority uses the role table plus MFA; no-MFA/ordinary users cannot edit catalogue or Storage", async () => {
  assert.equal(
    await as(admin, () =>
      db
        .query("select public.is_content_editor() as allowed")
        .then((r) => r.rows[0].allowed),
    ),
    false,
  );
  assert.equal(
    await as(
      admin,
      () =>
        db
          .query("select public.is_content_editor() as allowed")
          .then((r) => r.rows[0].allowed),
      "aal2",
    ),
    true,
  );
  assert.equal(
    await as(
      first,
      () =>
        db
          .query("select public.is_content_editor() as allowed")
          .then((r) => r.rows[0].allowed),
      "aal2",
    ),
    false,
  );
  await assert.rejects(
    as(admin, () =>
      db.exec(
        "insert into public.announcements(title,body) values('Draft','Body')",
      ),
    ),
    /row.level.security/i,
  );
  await as(
    admin,
    async () => {
      await db.exec(
        "insert into public.announcements(title,body) values('Admin draft','Body')",
      );
      assert.equal(
        (await db.query("select public.get_app_content_v3() as data")).rows[0]
          .data.announcements.length,
        0,
      );
      assert.equal(
        (await db.query("select * from public.user_settings")).rows.length,
        1,
        "admin cannot browse listener preferences",
      );
    },
    "aal2",
  );
  await assert.rejects(
    as(
      admin,
      () =>
        db.exec(
          "insert into storage.objects(bucket_id,name) values('banners','account-test.png')",
        ),
      "aal2",
    ),
    /row.level.security/i,
    "Even MFA staff must upload images through R2, not Supabase Storage",
  );
});
test("deletion permission requires recent password proof and protects the studio administrator", async () => {
  await assert.rejects(
    as(first, () => db.exec("select public.assert_account_deletion_allowed()")),
    /password/i,
  );
  const recent = [
    { method: "password", timestamp: Math.floor(Date.now() / 1000) },
  ];
  assert.equal(
    await as(
      first,
      () =>
        db
          .query("select public.assert_account_deletion_allowed() as ok")
          .then((r) => r.rows[0].ok),
      "aal1",
      recent,
    ),
    true,
  );
  await assert.rejects(
    as(
      admin,
      () => db.exec("select public.assert_account_deletion_allowed()"),
      "aal2",
      recent,
    ),
    /Transfer/i,
  );
  await db.query(
    "insert into auth.mfa_factors(user_id,status) values($1,'verified')",
    [first],
  );
  await assert.rejects(
    as(
      first,
      () => db.exec("select public.assert_account_deletion_allowed()"),
      "aal1",
      recent,
    ),
    /authenticator/i,
  );
  assert.equal(
    await as(
      first,
      () =>
        db
          .query("select public.assert_account_deletion_allowed() as ok")
          .then((r) => r.rows[0].ok),
      "aal2",
      recent,
    ),
    true,
  );
  await db.query("delete from auth.mfa_factors where user_id=$1", [first]);
  await assert.rejects(
    db.query("delete from auth.users where id=$1", [admin]),
    /Transfer/i,
  );
  const disposable = randomUUID();
  await db.query(
    "insert into auth.users(id,email_confirmed_at) values($1,now())",
    [disposable],
  );
  await db.query("delete from auth.users where id=$1", [disposable]);
  for (const table of ["profiles", "user_roles", "user_settings"])
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from public.${table} where ${table === "profiles" ? "id" : "user_id"}=$1`,
          [disposable],
        )
      ).rows[0].n,
      0,
    );
});

function memoryStore() {
  const data = new Map();
  return {
    data,
    async getItem(key) {
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}
function fixture(uid = first) {
  return {
    version: 1,
    user_id: uid,
    role: "user",
    profile: { display_name: "Listener", revision: 0 },
    settings: { notifications_enabled: false, revision: 0 },
    favorites: [],
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
async function waitFor(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await tick();
  }
  assert.fail("Condition did not settle");
}
function engine(api, storage = memoryStore(), uid = first, now = Date.now) {
  return new AccountSync(uid, "test:" + uid, storage, api, randomUUID, now);
}
test("sync cache restores optimistically, coalesces taps, persists an offline outbox and keeps identities separate", async () => {
  const storage = memoryStore();
  let writes = 0;
  const api = {
    async read() {
      return fixture();
    },
    async write(changes) {
      writes++;
      return {
        account: fixture(),
        results: changes.map((c) => ({ id: c.id, status: "saved" })),
      };
    },
  };
  const sync = engine(api, storage);
  await sync.start();
  await waitFor(() => !!sync.getSnapshot().account);
  sync.setOnline(false);
  await sync.enqueue({ kind: "favorite", show_id: "mornings", value: true });
  await sync.enqueue({ kind: "favorite", show_id: "mornings", value: false });
  assert.equal(sync.getSnapshot().pending, 1);
  assert.equal(sync.getSnapshot().account.favorites[0].is_favorite, false);
  assert.equal(writes, 0);
  sync.stop();
  const restored = engine(api, storage);
  restored.setOnline(false);
  await restored.start();
  assert.equal(restored.getSnapshot().pending, 1);
  assert.equal(restored.getSnapshot().account.favorites[0].is_favorite, false);
  restored.stop();
  const other = engine(
    {
      async read() {
        return fixture(second);
      },
    },
    storage,
    second,
  );
  other.setOnline(false);
  await other.start();
  assert.equal(other.getSnapshot().account, null);
  assert.equal(other.getSnapshot().pending, 0);
  other.stop();
});
test("in-flight retries preserve operation IDs and newer taps; conflicts discard dependent writes", async () => {
  let resolve, reject, request;
  const api = {
    async read() {
      return fixture();
    },
    write(changes) {
      request = changes;
      return new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
    },
  };
  const sync = engine(api);
  await sync.start();
  await waitFor(() => !!sync.getSnapshot().account);
  await sync.enqueue({ kind: "favorite", show_id: "mornings", value: true });
  const sending = sync.refresh();
  await waitFor(() => !!request);
  const id = request[0].id;
  await sync.enqueue({ kind: "favorite", show_id: "mornings", value: false });
  resolve({
    account: {
      ...fixture(),
      favorites: [{ show_id: "mornings", is_favorite: true, revision: 1 }],
    },
    results: [{ id, status: "saved" }],
  });
  await sending;
  assert.equal(sync.getSnapshot().account.favorites[0].is_favorite, false);
  assert.equal(sync.getSnapshot().pending, 1);
  const secondSend = sync.refresh();
  await waitFor(() => request[0].id !== id);
  const secondId = request[0].id;
  assert.equal(request[0].base_revision, 1);
  resolve({
    account: {
      ...fixture(),
      favorites: [{ show_id: "mornings", is_favorite: true, revision: 5 }],
    },
    results: [{ id: secondId, status: "conflict" }],
  });
  await secondSend;
  assert.equal(sync.getSnapshot().pending, 0);
  assert.equal(sync.getSnapshot().account.favorites[0].is_favorite, true);
  assert.match(sync.getSnapshot().notice, /another device/);
  sync.stop();
});
test("lost responses retain immutable operation IDs, rate limits back off, and disposed sessions ignore late results", async () => {
  let now = 100000,
    last,
    calls = 0,
    complete;
  const api = {
    async read() {
      return fixture();
    },
    async write(changes) {
      last = changes;
      calls++;
      if (calls === 1) throw Object.assign(Error(), { code: "P0429" });
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  };
  const sync = engine(api, memoryStore(), first, () => now);
  await sync.start();
  await waitFor(() => !!sync.getSnapshot().account);
  await sync.enqueue({ kind: "settings", value: true });
  await sync.refresh();
  const id = last[0].id;
  assert.equal(sync.getSnapshot().pending, 1);
  await sync.refresh();
  assert.equal(calls, 1);
  now += 61000;
  const retry = sync.refresh();
  await waitFor(() => !!complete);
  assert.equal(last[0].id, id);
  const before = sync.getSnapshot();
  sync.stop();
  complete({ account: fixture(), results: [{ id, status: "saved" }] });
  await retry;
  assert.equal(sync.getSnapshot(), before);
});
test("cache validation rejects another owner and expires old pending writes", async () => {
  const storage = memoryStore();
  const now = Date.now();
  storage.data.set(
    "test:" + first,
    JSON.stringify({
      version: 1,
      saved_at: now,
      account: fixture(second),
      pending: [],
    }),
  );
  const wrong = engine({}, storage);
  wrong.setOnline(false);
  await wrong.start();
  assert.equal(wrong.getSnapshot().account, null);
  assert.match(wrong.getSnapshot().notice, /could not/);
  wrong.stop();
  storage.data.set(
    "test:" + first,
    JSON.stringify({
      version: 1,
      saved_at: now,
      account: fixture(),
      pending: [
        {
          ...change("settings", true),
          created_at: now - ACCOUNT_CACHE_AGE - 1,
          sent: true,
        },
      ],
    }),
  );
  const expired = engine({}, storage);
  expired.setOnline(false);
  await expired.start();
  assert.equal(expired.getSnapshot().pending, 0);
  assert.match(expired.getSnapshot().notice, /expired/);
  expired.stop();
});
test("secure storage chunks every session, supports unicode, rotates atomically and removes tokens", async () => {
  const raw = memoryStore(),
    secure = createChunkedStorage(raw, randomUUID);
  const value = "🔐".repeat(5000) + "session";
  await secure.setItem("session", value);
  assert.equal(await secure.getItem("session"), value);
  assert.ok([...raw.data.values()].every((v) => Buffer.byteLength(v) < 2048));
  const count = raw.data.size;
  await secure.setItem("session", "new-session");
  assert.equal(await secure.getItem("session"), "new-session");
  assert.ok(raw.data.size < count);
  await secure.removeItem("session");
  assert.equal(await secure.getItem("session"), null);
  assert.equal(raw.data.size, 0);
});
test("failed secure session rotation preserves the previous readable session", async () => {
  const raw = memoryStore();
  let failing = false;
  const secure = createChunkedStorage(
    {
      ...raw,
      async setItem(key, value) {
        if (failing && key.endsWith(".1")) throw Error("Keychain full");
        return raw.setItem(key, value);
      },
    },
    randomUUID,
  );
  await secure.setItem("session", "original");
  failing = true;
  await assert.rejects(secure.setItem("session", "x".repeat(2000)), /Keychain/);
  assert.equal(await secure.getItem("session"), "original");
});

test("separate operation records recover offline writes from two tabs without snapshot replacement losing them", async () => {
  const storage = memoryStore();
  storage.getAllKeys = async () => [...storage.data.keys()];
  const api = {
    async read() {
      return fixture();
    },
    async write(changes) {
      return {
        account: fixture(),
        results: changes.map((c) => ({ id: c.id, status: "saved" })),
      };
    },
  };
  const a = engine(api, storage),
    b = engine(api, storage);
  await a.start();
  await b.start();
  await waitFor(() => a.getSnapshot().account && b.getSnapshot().account);
  a.setOnline(false);
  b.setOnline(false);
  await a.enqueue({ kind: "favorite", show_id: "mornings", value: true });
  await a.enqueue({ kind: "favorite", show_id: "mornings", value: false });
  await b.enqueue({ kind: "settings", value: true });
  a.stop();
  b.stop();
  const resumed = engine(api, storage);
  resumed.setOnline(false);
  await resumed.start();
  assert.equal(resumed.getSnapshot().pending, 3);
  assert.equal(resumed.getSnapshot().account.favorites[0].is_favorite, false);
  assert.equal(
    resumed.getSnapshot().account.settings.notifications_enabled,
    true,
  );
  resumed.setOnline(true);
  await waitFor(() => resumed.getSnapshot().pending === 0);
  resumed.stop();
  assert.equal(
    [...storage.data.keys()].filter((k) => k.includes(":op:")).length,
    0,
  );
});

test("a stopped sync cannot restore private cache after logout while operation cleanup is pending", async () => {
  const storage = memoryStore();
  storage.getAllKeys = async () => [...storage.data.keys()];
  let release,
    removing = false;
  const originalRemove = storage.removeItem;
  storage.removeItem = async (key) => {
    if (key.includes(":op:")) {
      removing = true;
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    await originalRemove(key);
  };
  const api = {
    async read() {
      return fixture();
    },
    async write(changes) {
      return {
        account: fixture(),
        results: changes.map((c) => ({ id: c.id, status: "saved" })),
      };
    },
  };
  const sync = engine(api, storage);
  await sync.start();
  await waitFor(() => sync.getSnapshot().account);
  await sync.enqueue({ kind: "settings", value: true });
  const sending = sync.refresh();
  await waitFor(() => removing);
  sync.stop();
  release();
  await sending;
  await sync.clear();
  assert.equal(storage.data.size, 0);
});

const { createAccountDeleteHandler } = load(
  "supabase/functions/account-delete/handler.ts",
  {},
  { Request, Response, TextDecoder },
);
test("account deletion endpoint requires authorization and confirmation, enforces policy, and deletes only the verified caller", async () => {
  let removed = null,
    allowed = true,
    rate = false;
  const handler = createAccountDeleteHandler({
    async authorize(token) {
      return { userId: token === "valid.token" ? first : null, error: null };
    },
    async check() {
      return { allowed, error: rate ? { code: "P0429" } : null };
    },
    async remove(id) {
      removed = id;
      return { error: null };
    },
  });
  const request = (
    body = { confirm: true },
    token = "valid.token",
    method = "POST",
  ) =>
    new Request("https://test/account-delete", {
      method,
      headers: { Authorization: "Bearer " + token },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await handler(request({}, "", "OPTIONS"))).status, 204);
  assert.equal((await handler(request({ confirm: true }, "bad"))).status, 401);
  assert.equal(
    (await handler(request({ confirm: true, user_id: second }))).status,
    400,
  );
  assert.equal(removed, null);
  allowed = false;
  assert.equal((await handler(request())).status, 403);
  assert.equal(removed, null);
  rate = true;
  assert.equal((await handler(request())).status, 429);
  rate = false;
  allowed = true;
  assert.equal((await handler(request())).status, 200);
  assert.equal(removed, first);
});

const { boundedFetch } = load(
  "src/utils/boundedFetch.ts",
  {},
  { Request, Response },
);
test("account requests propagate cancellation and abort a hung request without AbortSignal.any", async () => {
  const fetcher = async (_, init) =>
    new Promise((resolve, reject) => {
      if (init.signal.aborted) return reject(Error("aborted"));
      init.signal.addEventListener("abort", () => reject(Error("aborted")), {
        once: true,
      });
    });
  const bounded = boundedFetch(fetcher, 10);
  await assert.rejects(bounded("https://test"), /aborted/);
  const controller = new AbortController();
  const pending = bounded("https://test", { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/);
  const response = await boundedFetch(async () => Response.json({ ok: true }))(
    "https://test",
  );
  assert.deepEqual(await response.json(), { ok: true });
});
