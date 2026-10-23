const assert = require("node:assert/strict");
const { test, before, beforeEach, after } = require("node:test");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const { randomUUID, webcrypto } = require("node:crypto");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const { buildSeed } = require("./backend/seed.cjs");
const root = path.resolve(__dirname, "..");
const exportsForWorker = {};
new vm.Script(
  ts.transpileModule(
    fs.readFileSync(
      path.join(root, "supabase/functions/push-dispatch/handler.ts"),
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
).runInNewContext({
  exports: exportsForWorker,
  Request,
  Response,
  AbortSignal,
  crypto: webcrypto,
  setTimeout,
  clearTimeout,
});
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
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
      (f) => f.endsWith(".sql") && !f.endsWith("_public_content_delivery.sql"),
    )
    .sort())
    await db.exec(
      fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"),
    );
  await db.exec(buildSeed());
});
beforeEach(async () => {
  await db.exec(`truncate app_private.push_jobs,app_private.push_one_time,app_private.push_devices,app_private.push_worker_leases,app_private.push_rate_limits;
 delete from auth.users;
 update app_private.push_maintenance set next_cleanup_at=now()+interval '1 hour';
 delete from public.show_schedules;`);
  await schedule(false);
});
after(async () => await db?.close());
async function schedule(live) {
  await db.exec(`delete from public.show_schedules;
 insert into public.show_schedules(id,show_id,day_of_week,starts_at,ends_at,timezone)
 select 'capacity-slot','restart',extract(dow from start)::int,start::time,(start+interval '1 hour')::time,'Africa/Johannesburg'
 from(select date_trunc('minute',now() at time zone 'Africa/Johannesburg') ${live ? "-" : "+"} interval '5 minutes' start) s;`);
}
async function addDevices(n = 1, mixed = false) {
  if (mixed) {
    await db.exec(`insert into auth.users(id,email_confirmed_at) select md5('capacity-user-'||n)::uuid,now() from generate_series(1,${Math.floor(n / 2)}) n;
  update public.user_settings set notifications_enabled=true,reminder_scope='favorites',reminder_lead_minutes=5;
  insert into public.user_favorites(user_id,show_id) select id,'restart' from public.profiles;`);
  }
  await db.exec(`insert into app_private.push_devices(id,secret_hash,sequence,token,platform,environment,user_id,enabled,reminders_enabled,scope,lead_minutes,favorites)
 select md5('capacity-device-'||n)::uuid,repeat('a',64),1,'ExpoPushToken['||md5('capacity-device-'||n)||']',case when n%2=0 then 'ios' else 'android' end,'preview',
 ${mixed ? `case when n<=${Math.floor(n / 2)} then md5('capacity-user-'||n)::uuid else null end` : "null"},true,true,'favorites',5,array['restart'] from generate_series(1,${n}) n;`);
  return (
    await db.query("select id from app_private.push_devices order by id")
  ).rows.map((r) => r.id);
}
async function rpc(name, args) {
  const keys = Object.keys(args ?? {}),
    values = keys.map((k) => {
      const v = args[k];
      return ["p_results", "p_receipts"].includes(k) ? JSON.stringify(v) : v;
    });
  return (
    await db.query(
      `select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(",")}) result`,
      values,
    )
  ).rows[0].result;
}
const begin = (run, allowed = null) =>
  rpc("push_worker_begin", {
    p_environment: "preview",
    p_lease: run,
    p_allowed: allowed,
  });
const flush = (run, results = [], extra = {}) =>
  rpc("push_worker_flush", {
    p_environment: "preview",
    p_lease: run,
    p_results: results,
    ...extra,
  });
const sent = (j) => ({
  id: j.id,
  lease: j.lease,
  state: "sent",
  ticket: "ticket-" + j.id,
  error: null,
});
function worker(options = {}) {
  const calls = [],
    messages = [],
    pauses = [];
  let sends = 0;
  const handler = exportsForWorker.createPushDispatchHandler({
    workerSecret: "s".repeat(64),
    accessToken: "test-server-credential",
    enabled: options.enabled ?? true,
    environment: "preview",
    allowed: options.allowed ?? null,
    now: options.now,
    pause: async (ms) => {
      pauses.push(ms);
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      try {
        const data = await rpc(name, args);
        if (options.lostResponse === name)
          throw Error("Simulated lost acknowledgement");
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    fetch: async (url, init) => {
      assert.ok(url.startsWith("https://exp.host/--/api/v2/push/"));
      if (url.endsWith("/send")) {
        const batch = JSON.parse(init.body);
        messages.push(...batch);
        sends++;
        assert.ok(batch.length <= 100);
        if (options.send) return options.send(batch, sends);
        return new Response(
          JSON.stringify({
            data: batch.map((m) => ({ status: "ok", id: "ticket-" + m.tag })),
          }),
        );
      }
      return new Response(
        JSON.stringify({
          data: Object.fromEntries(
            JSON.parse(init.body).ids.map((id) => [id, { status: "ok" }]),
          ),
        }),
      );
    },
  });
  return {
    calls,
    messages,
    pauses,
    run: () =>
      handler(
        new Request("https://worker.test", {
          method: "POST",
          headers: { authorization: "Bearer " + "s".repeat(64) },
        }),
      ),
  };
}

test("idle minute takes one RPC and releases the worker lease in the same transaction", async () => {
  const h = worker();
  const response = await h.run();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).idle, true);
  assert.deepEqual(
    h.calls.map((c) => c.name),
    ["push_worker_begin"],
  );
  assert.equal(h.messages.length, 0);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_worker_leases",
      )
    ).rows[0].n,
    0,
  );
});
test("worker overlap and allowlists remain enforced on the initial and subsequent claim", async () => {
  const ids = await addDevices(3),
    run = randomUUID();
  const first = await begin(run, [ids[0]]);
  assert.equal(first.jobs.length, 1);
  assert.equal((await begin(randomUUID())).acquired, false);
  const next = await flush(run, first.jobs.map(sent), {
    p_claim: true,
    p_allowed: [ids[0]],
  });
  assert.equal(next.length, 0);
  assert.equal(
    (await db.query("select count(*)::int n from app_private.push_jobs"))
      .rows[0].n,
    1,
  );
});
test("anonymous and signed-in clients cannot invoke batched sender RPCs or read maintenance state", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await assert.rejects(begin(randomUUID()), /permission denied/);
      await assert.rejects(flush(randomUUID()), /permission denied/);
      await assert.rejects(
        db.query("select * from app_private.push_maintenance"),
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  }
  await db.exec("set role service_role");
  try {
    assert.equal((await begin(randomUUID())).idle, true);
  } finally {
    await db.exec("reset role");
  }
});
test("cleanup runs once per hour across repeated idle polls, without changing eligibility expiry", async () => {
  await db.exec(
    "insert into app_private.push_rate_limits(bucket,window_start) values('old',now()-interval '3 days')",
  );
  await begin(randomUUID());
  assert.equal(
    (await db.query("select count(*)::int n from app_private.push_rate_limits"))
      .rows[0].n,
    1,
  );
  await db.exec(
    "update app_private.push_maintenance set next_cleanup_at=now()-interval '1 minute'",
  );
  await begin(randomUUID());
  assert.equal(
    (await db.query("select count(*)::int n from app_private.push_rate_limits"))
      .rows[0].n,
    0,
  );
  await db.exec(
    "insert into app_private.push_rate_limits(bucket,window_start) values('old-again',now()-interval '3 days')",
  );
  await begin(randomUUID());
  assert.equal(
    (await db.query("select count(*)::int n from app_private.push_rate_limits"))
      .rows[0].n,
    1,
  );
});
test("invalid batch results roll back all acknowledgements and stale worker leases cannot write", async () => {
  await addDevices(2);
  const run = randomUUID(),
    first = await begin(run),
    results = first.jobs.map(sent);
  await assert.rejects(
    flush(run, [results[0], { ...results[1], state: "invalid" }]),
    /Invalid delivery result/,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='leased'",
      )
    ).rows[0].n,
    2,
  );
  await assert.rejects(flush(randomUUID(), results), /Worker lease required/);
  await assert.rejects(
    flush(run, Array(101).fill(results[0])),
    /Invalid worker batch/,
  );
  await db.exec(
    "update app_private.push_worker_leases set lease_until=now()-interval '1 second'",
  );
  await assert.rejects(flush(run, results), /Worker lease required/);
});
test("1,000 mixed Android/iOS guest/account devices get both phases without duplicate sends or per-recipient RPCs", async () => {
  await addDevices(1000, true);
  const started = performance.now(),
    h = worker();
  const response = await h.run();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accepted, 1000);
  assert.equal(h.messages.length, 1000);
  assert.equal(new Set(h.messages.map((m) => m.to)).size, 1000);
  assert.equal(h.calls.length, 12);
  assert.equal(
    h.calls.filter((c) => c.name === "push_worker_flush").length,
    10,
  );
  assert.equal(h.pauses.length, 9);
  assert.ok(h.pauses.every((ms) => ms === 250));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='sent'",
      )
    ).rows[0].n,
    1000,
  );
  const repeat = worker();
  assert.equal((await repeat.run()).status, 200);
  assert.equal(repeat.messages.length, 0);
  assert.equal(repeat.calls.length, 1);
  await schedule(true);
  const live = worker();
  assert.equal((await live.run()).status, 200);
  assert.equal(live.messages.length, 1000);
  assert.ok(live.messages.every((m) => m.title.endsWith("is on now")));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='sent' and phase='live'",
      )
    ).rows[0].n,
    1000,
  );
  const result = {
    devices: 1000,
    guests: 500,
    accounts: 500,
    platforms: ["android", "ios"],
    reminderMessages: h.messages.length,
    liveMessages: live.messages.length,
    reminderRpcCalls: h.calls.length,
    liveRpcCalls: live.calls.length,
    idleRpcCalls: repeat.calls.length,
    isolatedDatabaseElapsedMs: Math.round(performance.now() - started),
    provider: "simulated",
    pacing: "asserted 250ms between batches; sleep omitted in test",
  };
  fs.mkdirSync(path.join(root, ".qa/push-batching"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".qa/push-batching/capacity.json"),
    JSON.stringify(result, null, 2),
  );
});
test("temporary provider rejection persists retries in one batch and stops further sends", async () => {
  await addDevices(201);
  const h = worker({ send: async () => new Response("", { status: 429 }) });
  assert.equal((await h.run()).status, 200);
  assert.equal(h.messages.length, 100);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='retry'",
      )
    ).rows[0].n,
    100,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='queued'",
      )
    ).rows[0].n,
    101,
  );
  assert.equal(
    h.calls.find((c) => c.name === "push_worker_flush").args.p_claim,
    false,
  );
});
test("ambiguous provider timeout remains uncertain and cannot be blindly resent", async () => {
  await addDevices(3);
  const h = worker({
    send: async () => {
      throw Error("timeout");
    },
  });
  assert.equal((await h.run()).status, 200);
  assert.equal(h.messages.length, 3);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='uncertain'",
      )
    ).rows[0].n,
    3,
  );
  const repeat = worker();
  await repeat.run();
  assert.equal(repeat.messages.length, 0);
});
test("lost atomic acknowledgement cannot duplicate delivered jobs or blindly resend a preclaimed batch", async () => {
  await addDevices(200);
  const h = worker({ lostResponse: "push_worker_flush" });
  assert.equal((await h.run()).status, 503);
  assert.equal(h.messages.length, 100);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='sent'",
      )
    ).rows[0].n,
    100,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='leased'",
      )
    ).rows[0].n,
    100,
  );
  const retry = worker();
  await retry.run();
  assert.equal(retry.messages.length, 0);
  await db.exec(
    "update app_private.push_jobs set lease_until=now()-interval '1 second' where state='leased'",
  );
  const expired = worker();
  await expired.run();
  assert.equal(expired.messages.length, 0);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='uncertain'",
      )
    ).rows[0].n,
    100,
  );
});
test("due receipts are acknowledged in one batch without blocking an empty send queue", async () => {
  await addDevices(3);
  const initial = worker();
  await initial.run();
  await db.exec(
    "update app_private.push_jobs set receipt_due_at=now()-interval '1 minute'",
  );
  const receipts = worker();
  assert.equal((await receipts.run()).status, 200);
  assert.equal(receipts.messages.length, 0);
  assert.equal(
    receipts.calls.filter((c) => c.name === "push_worker_flush").length,
    1,
  );
  assert.equal(
    receipts.calls.find((c) => c.name === "push_worker_flush").args.p_receipts
      .length,
    3,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where receipt_state='ok'",
      )
    ).rows[0].n,
    3,
  );
});

test("empty test audiences and other environments never receive an initial or subsequent batch", async () => {
  await addDevices(3);
  await db.exec(
    "update app_private.push_devices set environment='production' where id=(select id from app_private.push_devices order by id limit 1)",
  );
  const empty = worker({ allowed: [] });
  await empty.run();
  assert.equal(empty.messages.length, 0);
  assert.equal(empty.calls.length, 1);
  const preview = worker();
  await preview.run();
  assert.equal(preview.messages.length, 2);
});
test("the send budget is checked before claiming another batch, leaving unsent work queued", async () => {
  await addDevices(201);
  let time = 0;
  const h = worker({
    now: () => time,
    send: async (batch) => {
      time = 45000;
      return new Response(
        JSON.stringify({
          data: batch.map((m) => ({ status: "ok", id: "ticket-" + m.tag })),
        }),
      );
    },
  });
  assert.equal((await h.run()).status, 200);
  assert.equal(h.messages.length, 100);
  assert.equal(
    h.calls.find((c) => c.name === "push_worker_flush").args.p_claim,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='queued'",
      )
    ).rows[0].n,
    101,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from app_private.push_jobs where state='leased'",
      )
    ).rows[0].n,
    0,
  );
});
test("batched stale-token receipts cannot disable a rotated token", async () => {
  await addDevices(1);
  await worker().run();
  await db.exec(
    "update app_private.push_jobs set receipt_due_at=now()-interval '1 minute';update app_private.push_devices set token='ExpoPushToken[rotated_1234567890]'",
  );
  const run = randomUUID(),
    prepared = await begin(run);
  assert.equal(prepared.receipts.length, 1);
  await flush(run, [], {
    p_receipts: prepared.receipts.map((r) => ({
      id: r.id,
      result: "error",
      error: "DeviceNotRegistered",
    })),
  });
  assert.equal(
    (await db.query("select enabled from app_private.push_devices")).rows[0]
      .enabled,
    true,
  );
});
