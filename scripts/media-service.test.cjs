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
    },
  });
  const request = (bytes = png, type = "image/png", extra = {}) =>
    new Request("https://example.test/media-upload", {
      method: "POST",
      headers: {
        authorization: "Bearer staff-token",
        "content-type": type,
        "x-media-bucket": "banners",
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
test("legacy compatibility copies verify bytes even after duplicate/lost responses and never overwrite conflicts", async () => {
  const { preserveLegacyImage } = load(
    "supabase/functions/media-upload/compatibility.ts",
  );
  let uploads = 0;
  const deps = {
    upload: async () => {
      uploads++;
      throw Error("already exists");
    },
    read: async () => new Response(png),
    hash: async (bytes) => hash(bytes),
  };
  await preserveLegacyImage(deps, hash(png));
  assert.equal(uploads, 1);
  await assert.rejects(
    preserveLegacyImage(
      { ...deps, read: async () => new Response(jpg) },
      hash(png),
    ),
  );
  await assert.rejects(
    preserveLegacyImage(
      { ...deps, read: async () => new Response(null, { status: 403 }) },
      hash(png),
    ),
  );
  await assert.rejects(
    preserveLegacyImage(
      {
        ...deps,
        read: async () =>
          new Response(png, { headers: { "content-length": "10485761" } }),
      },
      hash(png),
    ),
  );
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
    "https://media.ace.radio/banners/r2/" + hash(png) + ".png",
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
