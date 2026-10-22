const assert = require("node:assert/strict");
const { test, before, after } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const sharp = require("sharp");
const { PGlite } = require("@electric-sql/pglite");
const { buildSeed } = require("./backend/seed.cjs");
const {
  optimize,
  cutoverSql,
  rollbackSql,
  safePath,
} = require("./backend/r2-media.cjs");
const root = path.resolve(__dirname, "..");
let db;
const editor = "10000000-0000-4000-8000-000000000001";
const ordinary = "10000000-0000-4000-8000-000000000002";
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  new vm.Script(code).runInNewContext({
    exports,
    AbortController,
    setTimeout,
    clearTimeout,
    require(name) {
      if (name === "@/services/publicSnapshot")
        return { publicSnapshotEnabled: () => false };
      if (name === "zod") return require("zod");
      assert.ok(Object.hasOwn(imports, name), "Unexpected import " + name);
      return imports[name];
    },
  });
  return exports;
}
const schedule = load("src/utils/showSchedule.ts");
const repository = load("src/services/contentRepository.ts", {
  "@/services/supabase": {
    getSupabaseClient() {
      throw Error("No network expected");
    },
  },
  "@/config/content": {
    contentConfig: { source: "supabase", url: "https://test.supabase.co" },
  },
  "@/utils/showSchedule": schedule,
});
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated,service_role;grant all on storage.objects to anon,authenticated,service_role;grant select on storage.buckets to anon,authenticated,service_role;`);
  for (const file of fs
    .readdirSync(path.join(root, "supabase/migrations"))
    .filter((file) => file.startsWith("20261015") && file.endsWith(".sql"))
    .sort())
    await db.exec(
      fs.readFileSync(path.join(root, "supabase/migrations", file), "utf8"),
    );
  await db.exec(buildSeed());
  await db.query("insert into auth.users values($1),($2)", [editor, ordinary]);
  await db.query(
    "insert into app_private.content_staff(user_id,role) values($1,'editor')",
    [editor],
  );
  await db.exec(
    fs.readFileSync(
      path.join(
        root,
        "supabase/migrations/20261022100000_r2_media_delivery.sql",
      ),
      "utf8",
    ),
  );
});
after(async () => {
  await db?.close();
});
const payload = async () =>
  (await db.query("select public.get_app_content_v3() as data")).rows[0].data;
async function role(uid, action) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      uid ?? "",
    ]);
    await db.exec("set local role " + (uid ? "authenticated" : "anon"));
    return await action();
  } finally {
    await db.exec("rollback");
  }
}
test("additive R2 migration keeps all content, original paths and legacy public APIs", async () => {
  const data = await role(null, payload);
  assert.equal(data.version, 3);
  assert.equal(data.shows.length, 11);
  assert.equal(data.media_assets.length, 31);
  assert.ok(data.media_assets.every((item) => item.public_url === null));
  assert.equal(
    repository.decodeContent(data, "https://test.supabase.co").shows.length,
    11,
  );
  for (const api of ["get_app_content", "get_app_content_v2"])
    assert.ok(
      (await db.query(`select public.${api}() as data`)).rows[0].data
        .media_assets.length >= 31,
    );
});
test("mobile artwork, posters, presenters and spotlight prefer R2 while old caches and invalid URLs fall back", async () => {
  const data = await payload();
  const original = repository.decodeContent(data, "https://test.supabase.co");
  const first = data.shows[0];
  const ids = new Set([
    first.artwork_id,
    first.poster_id,
    data.presenters[0].photo_id,
    data.banners[0].image_id,
  ]);
  for (const asset of data.media_assets)
    if (ids.has(asset.id))
      asset.public_url =
        "https://media.ace.radio/" + asset.id.replaceAll(":", "-") + ".jpg";
  const mapped = repository.decodeContent(data, "https://test.supabase.co");
  assert.match(mapped.shows[0].image.uri, /media\.ace\.radio/);
  assert.match(mapped.shows[0].poster.uri, /media\.ace\.radio/);
  assert.match(mapped.presenters[0].photo.uri, /media\.ace\.radio/);
  assert.match(mapped.banners[0].image.uri, /media\.ace\.radio/);
  for (const asset of data.media_assets)
    asset.public_url = "javascript:alert(1)";
  assert.equal(
    repository.decodeContent(data, "https://test.supabase.co").shows[0].image
      .uri,
    original.shows[0].image.uri,
  );
  for (const asset of data.media_assets) delete asset.public_url;
  assert.equal(
    repository.decodeContent(data, "https://test.supabase.co").shows[0].image
      .uri,
    original.shows[0].image.uri,
  );
});
test("existing media RLS still denies ordinary writes and permits only authorised staff", async () => {
  const asset = (await payload()).media_assets[0];
  const update = () =>
    db.query(
      "update public.media_assets set public_url=$2,r2_key=$3,r2_sha256=$4,r2_bytes=100 where id=$1 returning id",
      [
        asset.id,
        "https://media.ace.radio/" + asset.bucket_id + "/r2/test.jpg",
        asset.bucket_id + "/r2/test.jpg",
        "a".repeat(64),
      ],
    );
  assert.equal((await role(ordinary, update)).rows.length, 0);
  assert.equal((await role(editor, update)).rows.length, 1);
  await role(null, async () => {
    await assert.rejects(update(), /permission denied/);
  });
});
test("database constraints reject partial, insecure and escaping R2 delivery metadata", async () => {
  const asset = (await payload()).media_assets[0];
  for (const [url, key, sha, bytes] of [
    ["http://media.test/a", asset.bucket_id + "/r2/a", "a".repeat(64), 10],
    ["https://media.test/a", "../a", "a".repeat(64), 10],
    ["https://media.test/a", asset.bucket_id + "/r2/a", "bad", 10],
    [
      "https://media.test/a",
      asset.bucket_id + "/r2/a",
      "a".repeat(64),
      10485761,
    ],
    [
      "https://user@media.test/a",
      asset.bucket_id + "/r2/a",
      "a".repeat(64),
      10,
    ],
  ]) {
    await assert.rejects(
      db.query(
        "update public.media_assets set public_url=$2,r2_key=$3,r2_sha256=$4,r2_bytes=$5 where id=$1",
        [asset.id, url, key, sha, bytes],
      ),
      /media_r2_delivery/,
    );
  }
});
test("generated cutover is idempotent, keeps Supabase metadata and aborts atomically on a concurrent edit", async () => {
  const assets = (
    await db.query("select * from public.media_assets order by id limit 2")
  ).rows;
  const manifest = {
    assets,
    events: [],
    announcements: [],
    objects: assets.map((asset, index) => ({
      bucketId: asset.bucket_id,
      sourcePath: asset.object_path,
      key: asset.bucket_id + "/r2/" + index + ".jpg",
      sha256: String(index).repeat(64),
      bytes: 100,
    })),
  };
  const { sql } = cutoverSql(manifest, "https://media.ace.radio");
  await db.exec(sql);
  await db.exec(sql);
  const updated = (
    await db.query("select * from public.media_assets where id=$1", [
      assets[0].id,
    ])
  ).rows[0];
  assert.equal(updated.object_path, assets[0].object_path);
  assert.equal(updated.sha256, assets[0].sha256);
  assert.match(updated.public_url, /media\.ace\.radio/);
  await db.query(
    "update public.media_assets set alt_text='New editorial text' where id=$1",
    [assets[0].id],
  );
  await db.exec(rollbackSql(manifest, "https://media.ace.radio"));
  await db.exec(rollbackSql(manifest, "https://media.ace.radio"));
  const restored = (
    await db.query("select * from public.media_assets where id=$1", [
      assets[0].id,
    ])
  ).rows[0];
  assert.equal(restored.public_url, null);
  assert.equal(restored.object_path, assets[0].object_path);
  assert.equal(
    restored.alt_text,
    "New editorial text",
    "Rollback must preserve later editorial changes",
  );
  await db.query(
    "update public.media_assets set public_url=null,r2_key=null,r2_sha256=null,r2_bytes=null where id=any($1)",
    [assets.map((asset) => asset.id)],
  );
  manifest.assets = (
    await db.query(
      "select * from public.media_assets where id=any($1) order by id",
      [assets.map((asset) => asset.id)],
    )
  ).rows;
  await db.query(
    "update public.media_assets set alt_text='Concurrent edit' where id=$1",
    [manifest.assets[1].id],
  );
  // Force a distinct timestamp even on fast clocks.
  await db.query(
    "update public.media_assets set updated_at=updated_at+interval '1 second' where id=$1",
    [manifest.assets[1].id],
  );
  await assert.rejects(
    db.exec(cutoverSql(manifest, "https://media.ace.radio").sql),
    /changed since review/,
  );
  await db.exec("rollback");
  assert.equal(
    (
      await db.query("select public_url from public.media_assets where id=$1", [
        assets[0].id,
      ])
    ).rows[0].public_url,
    null,
  );
});
test("optimisation reduces photographic PNG downloads without changing dimensions; transparency survives", async () => {
  const opaque = await sharp({
    create: { width: 160, height: 80, channels: 3, background: "#145c42" },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const optimized = await optimize(opaque);
  assert.ok(optimized.bytes.length < opaque.length);
  assert.equal(optimized.width, 160);
  assert.equal(optimized.height, 80);
  const alpha = await sharp({
    create: {
      width: 80,
      height: 40,
      channels: 4,
      background: { r: 0, g: 100, b: 50, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
  const result = await optimize(alpha);
  assert.equal(result.mimeType, "image/png");
  assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true);
  assert.equal(safePath("../private"), false);
  assert.equal(safePath("banners/r2/a.jpg"), true);
});
