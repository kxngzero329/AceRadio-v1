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
test("mobile artwork, posters, presenters and spotlight use R2; missing legacy URLs use placeholders", async () => {
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
    repository.decodeContent(data, "https://test.supabase.co").shows[0].image,
    undefined,
  );
  for (const asset of data.media_assets) delete asset.public_url;
  assert.equal(
    repository.decodeContent(data, "https://test.supabase.co").shows[0].image,
    undefined,
  );
});
test("new R2-only records resolve artwork and announcement images without a Supabase object", async () => {
  const data = await payload();
  const sha = "b".repeat(64);
  const asset = {
    ...data.media_assets[0],
    id: `r2:show-artwork:${sha}`,
    object_path: `r2/${sha}.webp`,
    public_url: `https://media.ace.radio/show-artwork/r2/${sha}.webp`,
  };
  data.media_assets.push(asset);
  data.shows[0].artwork_id = asset.id;
  const base = {
    id: "new-update",
    title: "Station update",
    body: "Full update",
    link_url: null,
    starts_at: null,
    ends_at: null,
  };
  data.announcements = [{ ...base, image_url: asset.public_url }];
  let decoded = repository.decodeContent(data, "https://test.supabase.co");
  assert.equal(decoded.shows[0].image.uri, asset.public_url);
  assert.equal(decoded.announcements[0].imageUrl, asset.public_url);
  for (const image_url of [
    undefined,
    null,
    "http://insecure.test/a",
    "javascript:alert(1)",
    "https://user:secret@media.test/a",
  ]) {
    data.announcements = [{ ...base, image_url }];
    decoded = repository.decodeContent(data, "https://test.supabase.co");
    assert.equal(decoded.announcements[0].imageUrl, null);
    assert.equal(decoded.announcements[0].body, base.body);
  }
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

test("shared R2 library migration merges duplicate references, guards concurrent edits and blocks Storage uploads", async () => {
  const { buildLibraryPlan, librarySql } = require("./backend/r2-library.cjs");
  const crypto = require("node:crypto");
  let assets = (await db.query("select * from public.media_assets order by id"))
    .rows;
  const portrait = assets.find((a) => a.bucket_id === "presenter-photos");
  const art = assets.find((a) => a.bucket_id === "show-artwork");
  for (const asset of assets) {
    const hash = crypto
      .createHash("sha256")
      .update(asset.id === art.id ? portrait.id : asset.id)
      .digest("hex");
    const key = `${asset.bucket_id}/r2/${hash}.png`;
    await db.query(
      "update public.media_assets set public_url=$2,r2_key=$3,r2_sha256=$4,r2_bytes=100 where id=$1",
      [asset.id, "https://media.test/" + key, key, hash],
    );
  }
  await db.query(
    "update public.shows set artwork_id=$1 where id=(select id from public.shows order by id limit 1)",
    [art.id],
  );
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20261023140000_shared_r2_library.sql"),
    "utf8",
  );
  await db.exec(migration);
  const inventory = async () => ({
    assets: (await db.query("select * from public.media_assets order by id"))
      .rows,
    objects: [],
    events: [],
    announcements: [],
  });
  let plan = buildLibraryPlan(await inventory());
  assert.equal(plan.aliases.length, 1);
  assert.equal(plan.aliases[0].canonical, portrait.id);
  await db.query(
    "update public.media_assets set alt_text='Concurrent editorial change' where id=$1",
    [portrait.id],
  );
  await assert.rejects(db.exec(librarySql(plan)), /Media changed since review/);
  await db.exec("rollback");
  plan = buildLibraryPlan(await inventory());
  await db.exec(librarySql(plan));
  await db.exec(librarySql(plan));
  assert.equal(
    (await db.query("select id from public.media_assets where id=$1", [art.id]))
      .rows.length,
    0,
  );
  assert.equal(
    (await db.query("select artwork_id from public.shows order by id limit 1"))
      .rows[0].artwork_id,
    portrait.id,
  );
  assert.equal(
    (
      await db.query("select alt_text from public.media_assets where id=$1", [
        portrait.id,
      ])
    ).rows[0].alt_text,
    "Concurrent editorial change",
  );
  assert.equal(
    (
      await db.query(
        "select media_category from public.media_assets where id=$1",
        [portrait.id],
      )
    ).rows[0].media_category,
    "headshots",
  );
  await role(editor, async () => {
    await assert.rejects(
      db.query(
        "insert into storage.objects(bucket_id,name) values('show-artwork','forbidden.png')",
      ),
      /row-level security/,
    );
  });
  assert.ok(
    (await db.query("select r2_key from public.media_assets")).rows.every((a) =>
      /^(headshots|show-banners)\//.test(a.r2_key),
    ),
  );
});

test("solo shows share presenter headshots across the public API; edits and removals propagate without changing group art", async () => {
  const { rows: shows } = await db.query(
    "select id,artwork_id from public.shows order by id",
  );
  const { rows: hosts } = await db.query(
    "select * from public.show_presenters",
  );
  const solo = shows.find(
    (s) => hosts.filter((h) => h.show_id === s.id).length === 1 && s.artwork_id,
  );
  const group = shows.find(
    (s) => hosts.filter((h) => h.show_id === s.id).length > 1,
  );
  assert.ok(solo && group);
  const person = hosts.find((h) => h.show_id === solo.id).presenter_id;
  const oldGroup = group.artwork_id;
  await db.exec(
    fs.readFileSync(
      path.join(
        root,
        "supabase/migrations/20261023160000_shared_presenter_headshots.sql",
      ),
      "utf8",
    ),
  );
  assert.equal(
    (
      await db.query("select photo_id from public.presenters where id=$1", [
        person,
      ])
    ).rows[0].photo_id,
    solo.artwork_id,
  );
  const replacement = (
    await db.query(
      "select id from public.media_assets where media_category='headshots' and id<>$1 limit 1",
      [solo.artwork_id],
    )
  ).rows[0].id;
  await role(editor, async () => {
    await db.query("update public.presenters set photo_id=$2 where id=$1", [
      person,
      replacement,
    ]);
    const content = await payload();
    assert.equal(
      content.shows.find((s) => s.id === solo.id).artwork_id,
      replacement,
    );
    assert.equal(
      content.shows.find((s) => s.id === group.id).artwork_id,
      oldGroup,
    );
    await db.query("update public.shows set artwork_id=$2 where id=$1", [
      solo.id,
      replacement,
    ]);
    assert.equal(
      (
        await db.query("select photo_id from public.presenters where id=$1", [
          person,
        ])
      ).rows[0].photo_id,
      replacement,
    );
    await db.query("update public.shows set artwork_id=null where id=$1", [
      solo.id,
    ]);
    assert.equal(
      (
        await db.query("select photo_id from public.presenters where id=$1", [
          person,
        ])
      ).rows[0].photo_id,
      null,
    );
    assert.equal(
      (await payload()).shows.find((s) => s.id === solo.id).artwork_id,
      null,
    );
  });
  await role(ordinary, async () => {
    assert.equal(
      (
        await db.query(
          "update public.presenters set photo_id=null where id=$1 returning id",
          [person],
        )
      ).rows.length,
      0,
    );
  });
  await db.exec("begin;set local role anon");
  try {
    const content = await payload();
    for (const show of content.shows) {
      const links = content.show_presenters.filter(
        (h) => h.show_id === show.id,
      );
      if (links.length === 1)
        assert.equal(
          show.artwork_id,
          content.presenters.find((p) => p.id === links[0].presenter_id)
            .photo_id,
        );
    }
  } finally {
    await db.exec("rollback");
  }
});
