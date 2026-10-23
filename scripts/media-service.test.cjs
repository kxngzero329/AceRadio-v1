const assert = require("node:assert/strict");
const { test, before } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const sharp = require("sharp");
const { imageSize } = require("image-size");
const crypto = require("node:crypto");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new vm.Script(code, { filename: file }).runInNewContext({
    exports,
    Request,
    Response,
    Headers,
    URL,
    Uint8Array,
    AbortSignal,
    AbortController,
    crypto: crypto.webcrypto,
    setTimeout,
    clearTimeout,
    ...globals,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), "Unexpected dependency " + name);
      return imports[name];
    },
  });
  return exports;
}
const { createMediaUploadHandler } = load(
  "supabase/functions/media-upload/handler.ts",
);
let png, jpg, webp;
before(async () => {
  const image = () =>
    sharp({
      create: { width: 32, height: 16, channels: 3, background: "#155e45" },
    });
  png = await image().png().toBuffer();
  jpg = await image().jpeg().toBuffer();
  webp = await image().webp().toBuffer();
});
function harness(options = {}) {
  const calls = { auth: 0, quota: 0, put: [], save: [] };
  const handler = createMediaUploadHandler({
    configured: options.configured ?? true,
    async authorize(token) {
      calls.auth++;
      assert.equal(token, "staff-token");
      return options.allowed ?? true;
    },
    async consumeQuota() {
      calls.quota++;
      return options.quota !== false;
    },
    inspect: (bytes) => imageSize(bytes),
    hash: async (bytes) => hash(bytes),
    async put(...args) {
      calls.put.push(args);
      if (options.putError) throw Error("private provider diagnostic");
    },
    publicUrl: (key) => "https://media.ace.radio/" + key,
    async save(token, record) {
      calls.save.push({ token, record });
      if (options.saveError) throw Error("private database diagnostic");
      return record;
    },
  });
  const request = (bytes = png, type = "image/png", extra = {}) =>
    new Request("https://example.test/media-upload", {
      method: "POST",
      headers: {
        authorization: "Bearer staff-token",
        "content-type": type,
        "x-media-bucket": "show-banners",
        ...extra,
      },
      body: bytes,
    });
  return { handler, calls, request };
}
test("media upload rejects anonymous users and non-admin/MFA sessions before touching R2", async () => {
  const h = harness();
  assert.equal(
    (await h.handler(h.request(png, "image/png", { authorization: "" })))
      .status,
    401,
  );
  assert.equal(h.calls.auth, 0);
  assert.equal(h.calls.put.length, 0);
  const denied = harness({ allowed: false });
  assert.equal((await denied.handler(denied.request())).status, 403);
  assert.equal(denied.calls.put.length, 0);
  const unconfigured = harness({ configured: false });
  assert.equal(
    (await unconfigured.handler(unconfigured.request())).status,
    503,
  );
  assert.equal(unconfigured.calls.put.length, 0);
});
test("upload quota rejects staff bursts before reading or storing images", async () => {
  const h = harness({ quota: false });
  const r = await h.handler(h.request());
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "60");
  assert.equal(h.calls.put.length, 0);
  assert.equal(h.calls.save.length, 0);
});
test("the deployed entry point stores bytes only in R2 and registers database references without Storage access", async () => {
  const { registerMedia } = load("supabase/functions/media-upload/register.ts");
  const rows = new Map();
  const writes = [];
  const objects = new Map();
  let handler,
    storageAccesses = 0,
    mode = "ok";
  const caller = {
    auth: {
      getUser: async () => ({ data: { user: { id: "staff" } }, error: null }),
    },
    rpc: async () => ({ data: true, error: null }),
    get storage() {
      storageAccesses++;
      throw Error("Supabase Storage is forbidden for new uploads");
    },
    from(table) {
      assert.equal(table, "media_assets");
      return {
        async upsert(record, options) {
          writes.push(record);
          assert.equal(options.onConflict, "r2_key");
          assert.equal(options.ignoreDuplicates, true);
          assert.ok(
            !Object.values(record).some((value) => value instanceof Uint8Array),
          );
          if (mode === "write-error")
            return { error: Error("Database unavailable") };
          if (!rows.has(record.r2_key)) rows.set(record.r2_key, { ...record });
          return { error: null };
        },
        select() {
          return {
            eq: (_, id) => ({
              single: async () => ({
                data: mode === "missing" ? null : rows.get(id),
                error:
                  mode === "read-error" ? Error("Database unavailable") : null,
              }),
            }),
          };
        },
      };
    },
  };
  load(
    "supabase/functions/media-upload/index.ts",
    {
      "npm:@supabase/supabase-js@2.117.3": { createClient: () => caller },
      "npm:image-size@2.0.4": { imageSize },
      "../_shared/r2.ts": {
        createR2Store: () => ({
          async put(key, bytes) {
            objects.set(key, bytes);
          },
          publicUrl: (key) => "https://media.ace.radio/" + key,
        }),
      },
      "./handler.ts": { createMediaUploadHandler },
      "./register.ts": { registerMedia },
    },
    {
      Deno: {
        env: { get: () => "test-configuration" },
        serve: (value) => {
          handler = value;
        },
      },
      fetch: () => {
        throw Error("No Supabase image verification downloads permitted");
      },
    },
  );
  const request = (bucket) =>
    new Request("https://test.invalid/media-upload", {
      method: "POST",
      headers: {
        authorization: "Bearer staff",
        "content-type": "image/png",
        "x-media-bucket": bucket,
      },
      body: png,
    });
  for (const bucket of [
    "headshots",
    "show-banners",
    "events",
    "announcements",
  ]) {
    const first = await handler(request(bucket));
    assert.equal(first.status, 200);
    const { media } = await first.json();
    assert.equal(media.public_url, "https://media.ace.radio/" + media.r2_key);
    assert.equal(hash(objects.get(media.r2_key)), media.r2_sha256);
    assert.equal(rows.get(media.r2_key).public_url, media.public_url);
    assert.equal((await handler(request(bucket))).status, 200);
  }
  assert.equal(
    rows.size,
    4,
    "identical retries must not duplicate media records",
  );
  assert.equal(objects.size, 4);
  const record = writes[0];
  rows.set(record.r2_key, { ...record, id: "presenter:existing-headshot" });
  const reused = await handler(request("headshots"));
  assert.equal((await reused.json()).media.id, "presenter:existing-headshot");
  assert.equal(rows.size, 4);

  for (mode of ["write-error", "read-error", "missing"]) {
    assert.equal((await handler(request("headshots"))).status, 502);
    assert.equal(rows.size, 4);
  }
  mode = "ok";
  rows.set(record.r2_key, { ...record, r2_bytes: record.r2_bytes + 1 });
  assert.equal((await handler(request("headshots"))).status, 502);
  rows.set(record.r2_key, {
    ...record,
    public_url: "https://other.test/conflicting-image.png",
  });
  assert.equal((await handler(request("headshots"))).status, 502);
  assert.equal(
    rows.get(record.r2_key).public_url,
    "https://other.test/conflicting-image.png",
  );
  assert.equal(storageAccesses, 0);
});
test("uploads use server-generated immutable keys, verified dimensions and idempotent media IDs", async () => {
  const h = harness();
  const first = await h.handler(h.request());
  assert.equal(first.status, 200);
  const { media } = await first.json();
  assert.equal(media.width, 32);
  assert.equal(media.height, 16);
  assert.equal(media.r2_bytes, png.length);
  assert.equal(media.r2_sha256, hash(png));
  assert.equal(
    media.public_url,
    "https://media.ace.radio/show-banners/" + hash(png) + ".png",
  );
  const again = await h.handler(h.request());
  assert.equal((await again.json()).media.id, media.id);
  assert.equal(h.calls.save.length, 2);
  assert.equal(h.calls.save[0].token, "staff-token");
  assert.ok(!JSON.stringify(media).includes("staff-token"));
  assert.ok(!JSON.stringify(media).includes("secret"));
});
test("JPEG, PNG and WebP are supported; forged image types, SVG and invalid paths are rejected", async () => {
  const h = harness();
  for (const [bytes, type] of [
    [jpg, "image/jpeg"],
    [png, "image/png"],
    [webp, "image/webp"],
  ])
    assert.equal((await h.handler(h.request(bytes, type))).status, 200);
  assert.equal((await h.handler(h.request(png, "image/jpeg"))).status, 415);
  assert.equal(
    (await h.handler(h.request(Buffer.from("<svg/>"), "image/png"))).status,
    415,
  );
  assert.equal(
    (
      await h.handler(
        h.request(png, "image/png", { "x-media-bucket": "../../other" }),
      )
    ).status,
    400,
  );
  assert.equal((await h.handler(h.request(png, "image/svg+xml"))).status, 415);
});
test("empty, oversized and decompression-sized images cannot reach R2", async () => {
  const h = harness();
  assert.equal((await h.handler(h.request(Buffer.alloc(0)))).status, 413);
  assert.equal(
    (
      await h.handler(
        h.request(png, "image/png", { "content-length": "10485761" }),
      )
    ).status,
    413,
  );
  const tooLarge = Buffer.from(png);
  tooLarge.writeUInt32BE(9000, 16);
  assert.equal((await h.handler(h.request(tooLarge))).status, 415);
  assert.equal(h.calls.put.length, 0);
});
test("provider/database failures retain retryable objects without revealing diagnostics or keys", async () => {
  for (const options of [{ putError: true }, { saveError: true }]) {
    const h = harness(options);
    const response = await h.handler(h.request());
    assert.equal(response.status, 502);
    assert.doesNotMatch(
      await response.text(),
      /private|diagnostic|secret|staff-token/,
    );
  }
});
test("preflight is supported and upload responses are never publicly cached", async () => {
  const h = harness();
  assert.equal(
    (
      await h.handler(
        new Request("https://example.test", { method: "OPTIONS" }),
      )
    ).status,
    204,
  );
  assert.equal(
    (await h.handler(new Request("https://example.test"))).status,
    405,
  );
  const response = await h.handler(h.request());
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});
test("R2 signer scopes requests to the configured bucket and verifies stored and public bytes", async () => {
  const calls = [];
  const { createR2Store } = load(
    "supabase/functions/_shared/r2.ts",
    { "npm:aws4fetch@1.0.20": require("aws4fetch") },
    {
      fetch: async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        calls.push(request);
        return request.method === "PUT"
          ? new Response(null, { status: 200 })
          : new Response(png);
      },
    },
  );
  const store = createR2Store({
    endpoint:
      "https://bc5f0307db1291ec21f84c8912720ef8.r2.cloudflarestorage.com",
    bucket: "aceradio-media",
    baseUrl: "https://media.ace.radio",
    accessKeyId: "test-key",
    secretAccessKey: "test-secret",
  });
  await store.put("banners/r2/image.png", png, "image/png", hash(png));
  assert.equal(calls.length, 3);
  assert.equal(calls[0].headers.get("if-none-match"), "*");
  assert.match(calls[0].headers.get("authorization"), /AWS4-HMAC-SHA256/);
  assert.match(calls[0].url, /aceradio-media\/banners\/r2\/image.png$/);
  assert.equal(
    calls[0].headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
  assert.equal(calls[2].headers.get("authorization"), null);
  await assert.rejects(
    store.put("../other", png, "image/png", hash(png)),
    /Invalid media key/,
  );
});
test("R2 conflicts and an incorrect public domain cannot be promoted as successful uploads", async () => {
  for (const corruptPublic of [false, true]) {
    const { createR2Store } = load(
      "supabase/functions/_shared/r2.ts",
      { "npm:aws4fetch@1.0.20": require("aws4fetch") },
      {
        fetch: async (input) => {
          const request = input instanceof Request ? input : new Request(input);
          if (request.method === "PUT")
            return new Response(null, { status: 412 });
          return new Response(
            request.url.startsWith("https://media.ace.radio") === corruptPublic
              ? Buffer.from("wrong")
              : png,
          );
        },
      },
    );
    const store = createR2Store({
      endpoint:
        "https://bc5f0307db1291ec21f84c8912720ef8.r2.cloudflarestorage.com",
      bucket: "aceradio-media",
      baseUrl: "https://media.ace.radio",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    });
    await assert.rejects(
      store.put("banners/r2/image.png", png, "image/png", hash(png)),
      /verification failed/,
    );
  }
});

test("private R2 migration copies validate the source hash and never accept arbitrary URLs or keys", async () => {
  const { createMediaMaintenanceHandler } = load(
    "supabase/functions/media-maintenance/handler.ts",
  );
  let copies = 0;
  const plan = {
    sourceKey: `banners/r2/${hash(png)}.png`,
    key: `show-banners/${hash(png)}.png`,
    sha256: hash(png),
    bytes: png.length,
    mimeType: "image/png",
  };
  const deps = {
    secret: "maintenance-test",
    publicUrl: (key) => "https://media.test/" + key,
    fetch: async () => new Response(png),
    hash: async (bytes) => hash(bytes),
    put: async () => {
      copies++;
    },
  };
  const handler = createMediaMaintenanceHandler(deps);
  const request = (body = plan, secret = "maintenance-test") =>
    new Request("https://test.invalid", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    });
  assert.equal((await handler(request(plan, "wrong"))).status, 401);
  for (const key of [
    "https://other.test/image.png",
    "../private",
    "other/" + hash(png) + ".png",
  ])
    assert.equal((await handler(request({ ...plan, key }))).status, 400);
  assert.equal((await handler(request())).status, 200);
  assert.equal(copies, 1);
  const corrupt = createMediaMaintenanceHandler({
    ...deps,
    fetch: async () => new Response(jpg),
  });
  assert.equal((await corrupt(request())).status, 502);
  assert.equal(copies, 1);
});

test("retired imports cannot recreate Supabase image files", () => {
  const { spawnSync } = require("node:child_process");
  const result = spawnSync(
    process.execPath,
    [require("node:path").join(__dirname, "backend/import.cjs"), "--apply"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Legacy Supabase image imports are retired/);
});

test("legacy retirement verifies both copies and cannot delete canonical images or catalogue objects", async () => {
  const sha = hash(png);
  const source = `presenter-photos/r2/${sha}.png`;
  const target = `headshots/${sha}.png`;
  for (const broken of [false, true]) {
    const deleted = [];
    let transientHead = true;
    const { createR2Store } = load(
      "supabase/functions/_shared/r2.ts",
      { "npm:aws4fetch@1.0.20": require("aws4fetch") },
      {
        fetch: async (input) => {
          const r = input instanceof Request ? input : new Request(input);
          const key = decodeURIComponent(new URL(r.url).pathname)
            .replace(/^\/aceradio-media\//, "")
            .replace(/^\//, "");
          if (r.method === "HEAD") {
            // A transient stale post-delete response must be rechecked; it must
            // not cause the next legacy object to be deleted without proof.
            if (deleted.includes(key) && transientHead) {
              transientHead = false;
              return new Response(null, { status: 200 });
            }
            return new Response(null, {
              status: deleted.includes(key) ? 404 : 200,
            });
          }
          if (r.method === "DELETE") {
            deleted.push(key);
            return new Response(null, { status: 204 });
          }
          return new Response(broken && key === target ? jpg : png);
        },
      },
    );
    const store = createR2Store({
      endpoint:
        "https://bc5f0307db1291ec21f84c8912720ef8.r2.cloudflarestorage.com",
      bucket: "aceradio-media",
      baseUrl: "https://media.ace.radio",
      accessKeyId: "fixture",
      secretAccessKey: "fixture",
    });
    for (const unsafe of [
      target,
      `public-content/${sha}.png`,
      `other/r2/${sha}.png`,
    ])
      await assert.rejects(
        store.retireLegacy(unsafe, target, sha),
        /Invalid legacy/,
      );
    await assert.rejects(
      store.retireLegacy(source, `headshots/${hash(jpg)}.png`, sha),
      /Invalid legacy/,
    );
    assert.equal(deleted.length, 0);
    if (broken) {
      await assert.rejects(
        store.retireLegacy(source, target, sha),
        /verification failed/,
      );
      assert.equal(deleted.length, 0);
    } else {
      assert.equal(
        (await store.retireLegacy(source, target, sha)).removed,
        true,
      );
      assert.deepEqual(deleted, [source]);
      assert.equal(
        (await store.retireLegacy(source, target, sha)).removed,
        false,
      );
    }
  }
});

test("private inventory handles pagination and rejects incomplete responses", async () => {
  for (const incomplete of [false, true]) {
    let page = 0;
    const { createR2Store } = load(
      "supabase/functions/_shared/r2.ts",
      { "npm:aws4fetch@1.0.20": require("aws4fetch") },
      {
        fetch: async (input) => {
          const url = new URL(input.url);
          assert.equal(url.searchParams.get("encoding-type"), "url");
          page++;
          if (page === 1)
            return new Response(
              "<ListBucketResult><Contents><Key>headshots%2Fone.png</Key></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>next</NextContinuationToken></ListBucketResult>",
            );
          assert.equal(url.searchParams.get("continuation-token"), "next");
          return new Response(
            incomplete
              ? "<ListBucketResult></ListBucketResult>"
              : "<ListBucketResult><Contents><Key>public-content%2Fcurrent.json</Key></Contents><IsTruncated>false</IsTruncated></ListBucketResult>",
          );
        },
      },
    );
    const store = createR2Store({
      endpoint:
        "https://bc5f0307db1291ec21f84c8912720ef8.r2.cloudflarestorage.com",
      bucket: "aceradio-media",
      baseUrl: "https://media.ace.radio",
      accessKeyId: "fixture",
      secretAccessKey: "fixture",
    });
    if (incomplete) await assert.rejects(store.list(), /Incomplete/);
    else
      assert.deepEqual(Array.from(await store.list()), [
        "headshots/one.png",
        "public-content/current.json",
      ]);
  }
});

test("legacy retirement plan refuses unknown objects and active old references", () => {
  const { retirementPlan } = require("./backend/retire-r2-legacy.cjs");
  const sha = hash(png),
    source = `show-artwork/r2/${sha}.png`,
    key = `headshots/${sha}.png`;
  const original = {
    assets: [
      {
        r2_key: source,
        r2_sha256: sha,
        r2_bytes: png.length,
        bucket_id: "show-artwork",
      },
    ],
    copies: [{ sourceKey: source, key, sha256: sha, mimeType: "image/png" }],
  };
  const current = {
    assets: [
      {
        r2_key: key,
        r2_sha256: sha,
        r2_bytes: png.length,
        public_url: "https://media.test/" + key,
      },
    ],
  };
  assert.equal(
    retirementPlan(
      [source, key, "public-content/v1/current.json"],
      original,
      current,
    ).length,
    1,
  );
  assert.throws(
    () => retirementPlan([source], original, current),
    /replacement is missing/,
  );
  assert.throws(
    () =>
      retirementPlan([`station-media/r2/${sha}.png`, key], original, current),
    /Unknown legacy/,
  );
  assert.throws(
    () =>
      retirementPlan([source, key], original, {
        assets: [...current.assets, { r2_key: source }],
      }),
    /live image reference/,
  );
  assert.throws(
    () =>
      retirementPlan([source, key], original, {
        ...current,
        events: [{ image_url: "https://media.test/" + source }],
      }),
    /direct live image/,
  );
});
