// Preparation is read-only remotely. Upload copies immutable objects only;
// cutover SQL is generated for separate review/approval, never executed here.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const { AwsClient } = require("aws4fetch");
const { root, cli, projectRef } = require("./linked-project.cjs");
const { readR2Config, ACCOUNT, BUCKET } = require("./r2-config.cjs");
const PROJECT = "dbgpfqyighcaquxwzkfe";
const directory = path.join(root, ".qa/r2-media");
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const allowedBuckets = new Set([
  "show-artwork",
  "presenter-photos",
  "banners",
  "station-media",
]);
const encodeKey = (key) => key.split("/").map(encodeURIComponent).join("/");
const sourceKey = (bucket, object) => bucket + "/" + object;
const jsonSql = (value) =>
  "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
function safePath(object) {
  return (
    typeof object === "string" &&
    object.length > 0 &&
    !/[\s\\]/.test(object) &&
    !object.startsWith("/") &&
    !object.split("/").some((part) => !part || part === "." || part === "..")
  );
}
async function readBytes(response, limit = 10485760) {
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > limit ||
    !response.body
  )
    throw Error("Image request failed or exceeded its size limit.");
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw Error("Image exceeds size limit.");
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally {
    void reader.cancel().catch(() => {});
  }
}
async function optimize(bytes) {
  const input = sharp(bytes, { limitInputPixels: 16777216 });
  const metadata = await input.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format) || metadata.pages > 1)
    throw Error("Only non-animated PNG, JPEG and WebP artwork is supported.");
  // Preserve orientation/dimensions exactly. Existing JPEG/WebP files are kept;
  // old PNG artwork is the main source of excess download traffic.
  let output = bytes,
    mimeType =
      "image/" + (metadata.format === "jpeg" ? "jpeg" : metadata.format);
  if (metadata.format === "png") {
    const stats = await input.stats();
    const candidate = stats.isOpaque
      ? await sharp(bytes)
          .removeAlpha()
          .jpeg({ quality: 88, chromaSubsampling: "4:4:4", mozjpeg: true })
          .toBuffer()
      : await sharp(bytes)
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toBuffer();
    if (candidate.length < bytes.length * 0.95) {
      output = candidate;
      mimeType = stats.isOpaque ? "image/jpeg" : "image/png";
    }
  }
  return {
    bytes: output,
    mimeType,
    width: metadata.width,
    height: metadata.height,
  };
}
async function prepare(args) {
  if (projectRef() !== PROJECT)
    throw Error("The linked project is not the reviewed AceRadio database.");
  const input = args[args.indexOf("--inventory") + 1];
  const raw = args.includes("--inventory")
    ? fs.readFileSync(path.resolve(input), "utf8")
    : cli([
        "db",
        "query",
        "--linked",
        "--file",
        path.join(__dirname, "r2-inventory.sql"),
        "-o",
        "json",
      ]);
  const result = JSON.parse(raw);
  const inventory = result.rows?.[0]?.inventory;
  if (
    !inventory ||
    !["assets", "objects", "events", "announcements"].every((name) =>
      Array.isArray(inventory[name]),
    )
  )
    throw Error("Invalid public media inventory.");
  fs.mkdirSync(path.join(directory, "objects"), { recursive: true });
  const imported = JSON.parse(
    fs.readFileSync(path.join(root, "supabase/import/catalogue.json"), "utf8"),
  );
  const files = new Map(
    imported.files.map((file) => [
      sourceKey(file.bucket_id, file.object_path),
      file,
    ]),
  );
  const objects = [];
  for (const object of inventory.objects) {
    if (
      !allowedBuckets.has(object.bucket_id) ||
      !safePath(object.object_path) ||
      !Number.isSafeInteger(object.bytes) ||
      object.bytes < 1 ||
      object.bytes > 10485760
    )
      throw Error("Invalid public image metadata.");
    const key = sourceKey(object.bucket_id, object.object_path),
      original = files.get(key);
    let bytes;
    if (original && fs.existsSync(path.join(root, original.local_path))) {
      const filename = path.resolve(root, original.local_path);
      if (!filename.startsWith(root + path.sep))
        throw Error("Invalid imported file path.");
      bytes = fs.readFileSync(filename);
      if (digest(bytes) !== original.sha256)
        throw Error("An imported source image changed.");
    } else {
      if (!args.includes("--download-missing"))
        throw Error(
          "A source image is not available locally. Re-run with --download-missing to download only missing public images once.",
        );
      bytes = await readBytes(
        await fetch(
          `https://${PROJECT}.supabase.co/storage/v1/object/public/${encodeURIComponent(object.bucket_id)}/${encodeKey(object.object_path)}`,
          { signal: AbortSignal.timeout(15000), redirect: "error" },
        ),
      );
    }
    if (bytes.length !== object.bytes)
      throw Error(
        "Live image size changed; refresh the inventory before continuing.",
      );
    const expected = inventory.assets.find(
      (asset) =>
        asset.bucket_id === object.bucket_id &&
        asset.object_path === object.object_path,
    )?.sha256;
    const sourceSha256 = digest(bytes);
    if (expected && expected !== sourceSha256)
      throw Error("A source image no longer matches the database hash.");
    const optimized = await optimize(bytes),
      sha256 = digest(optimized.bytes);
    const extension =
      optimized.mimeType === "image/jpeg"
        ? "jpg"
        : optimized.mimeType.split("/")[1];
    const r2key = `${object.bucket_id}/r2/${sha256}.${extension}`;
    const filename = path.join(directory, "objects", `${sha256}.${extension}`);
    fs.writeFileSync(filename, optimized.bytes);
    objects.push({
      bucketId: object.bucket_id,
      sourcePath: object.object_path,
      sourceSha256,
      sourceBytes: bytes.length,
      key: r2key,
      sha256,
      bytes: optimized.bytes.length,
      mimeType: optimized.mimeType,
      width: optimized.width,
      height: optimized.height,
      localFile: path.relative(root, filename),
    });
  }
  const manifest = {
    version: 1,
    project: PROJECT,
    account: ACCOUNT,
    bucket: BUCKET,
    createdAt: new Date().toISOString(),
    objects,
    assets: inventory.assets,
    events: inventory.events,
    announcements: inventory.announcements,
  };
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  const before = objects.reduce((n, item) => n + item.sourceBytes, 0),
    after = objects.reduce((n, item) => n + item.bytes, 0);
  console.log(
    JSON.stringify(
      {
        prepared: objects.length,
        originalBytes: before,
        deliveryBytes: after,
        reductionPercent: Math.round((1 - after / before) * 100),
        manifest: ".qa/r2-media/manifest.json",
        remoteWrites: false,
      },
      null,
      2,
    ),
  );
}
function validateManifest(manifest) {
  if (
    manifest.version !== 1 ||
    manifest.project !== PROJECT ||
    manifest.account !== ACCOUNT ||
    manifest.bucket !== BUCKET ||
    !Array.isArray(manifest.objects)
  )
    throw Error("Unreviewed R2 manifest target.");
  for (const item of manifest.objects) {
    const filename = path.resolve(root, item.localFile);
    if (
      !allowedBuckets.has(item.bucketId) ||
      !safePath(item.key) ||
      !item.key.startsWith(item.bucketId + "/r2/") ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !filename.startsWith(path.join(directory, "objects") + path.sep)
    )
      throw Error("Invalid migration object.");
    const bytes = fs.readFileSync(filename);
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256)
      throw Error("Prepared image changed. Recreate and review the plan.");
  }
}
function cutoverSql(manifest, baseUrl) {
  const objects = new Map(
    manifest.objects.map((item) => [
      sourceKey(item.bucketId, item.sourcePath),
      item,
    ]),
  );
  const assets = manifest.assets.flatMap((asset) => {
    const object = objects.get(sourceKey(asset.bucket_id, asset.object_path));
    return object
      ? [
          {
            id: asset.id,
            updated_at: asset.updated_at,
            bucket_id: asset.bucket_id,
            object_path: asset.object_path,
            public_url: `${baseUrl}/${encodeKey(object.key)}`,
            r2_key: object.key,
            r2_sha256: object.sha256,
            r2_bytes: object.bytes,
          },
        ]
      : [];
  });
  const direct = [];
  for (const table of ["events", "announcements"])
    for (const record of manifest[table]) {
      const prefix = `https://${PROJECT}.supabase.co/storage/v1/object/public/`;
      if (!record.image_url?.startsWith(prefix)) continue;
      let key;
      try {
        key = record.image_url
          .slice(prefix.length)
          .split("/")
          .map(decodeURIComponent)
          .join("/");
      } catch {
        throw Error("Invalid source media URL.");
      }
      const object = objects.get(key);
      if (!object)
        throw Error("A direct image reference has no verified object.");
      direct.push({
        table,
        id: record.id,
        updated_at: record.updated_at,
        old_url: record.image_url,
        new_url: `${baseUrl}/${encodeKey(object.key)}`,
      });
    }
  return {
    assets,
    direct,
    sql:
      `-- Generated only after every R2/public image verified. Review and approve before execution.\nbegin;\nset local lock_timeout = '5s';\ndo $cutover$\ndeclare item jsonb; current_row public.media_assets%rowtype; affected integer;\nbegin\n for item in select value from jsonb_array_elements(${jsonSql(assets)}) loop\n  select * into current_row from public.media_assets where id=item->>'id' for update;\n  if not found then raise exception 'A media record was removed; refresh the plan.'; end if;\n  if current_row.public_url=item->>'public_url' and current_row.r2_sha256=item->>'r2_sha256' and current_row.r2_key=item->>'r2_key' then continue; end if;\n  if current_row.updated_at is distinct from (item->>'updated_at')::timestamptz or current_row.bucket_id<>item->>'bucket_id' or current_row.object_path<>item->>'object_path' or current_row.public_url is not null then raise exception 'Media changed since review; no records were switched.'; end if;\n  update public.media_assets set public_url=item->>'public_url',r2_key=item->>'r2_key',r2_sha256=item->>'r2_sha256',r2_bytes=(item->>'r2_bytes')::bigint where id=item->>'id';\n end loop;\n` +
      direct
        .map(
          (item) =>
            ` if exists(select 1 from public.${item.table} where id=${"'" + item.id.replaceAll("'", "''") + "'"}::uuid and image_url=${"'" + item.new_url.replaceAll("'", "''") + "'"}) then null; else\n update public.${item.table} set image_url=${"'" + item.new_url.replaceAll("'", "''") + "'"} where id=${"'" + item.id.replaceAll("'", "''") + "'"}::uuid and updated_at=${"'" + item.updated_at.replaceAll("'", "''") + "'"}::timestamptz and image_url=${"'" + item.old_url.replaceAll("'", "''") + "'"};\n get diagnostics affected = row_count; if affected<>1 then raise exception 'An image reference changed since review.'; end if; end if;\n`,
        )
        .join("") +
      `end;\n$cutover$;\ncommit;\n`,
  };
}
async function upload(args) {
  if (
    !args.includes("--confirm-bucket") ||
    args[args.indexOf("--confirm-bucket") + 1] !== BUCKET
  )
    throw Error("Explicit --confirm-bucket aceradio-media is required.");
  const config = readR2Config({ credentials: true, publicUrl: true });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
  );
  validateManifest(manifest);
  const signer = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
    retries: 0,
  });
  let verified = 0;
  for (const item of manifest.objects) {
    const url = `${config.endpoint}/${config.bucket}/${encodeKey(item.key)}`;
    const bytes = fs.readFileSync(path.resolve(root, item.localFile));
    const signed = await signer.sign(url, {
      method: "PUT",
      headers: {
        "Content-Type": item.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "x-amz-meta-sha256": item.sha256,
        "If-None-Match": "*",
      },
      body: bytes,
    });
    const response = await fetch(signed, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (![200, 201, 412].includes(response.status))
      throw Error(
        "R2 copy failed; credentials and provider responses are not printed.",
      );
    const stored = await signer.sign(url, { method: "GET" });
    if (
      digest(
        await readBytes(
          await fetch(stored, {
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          }),
        ),
      ) !== item.sha256
    )
      throw Error(
        "R2 object conflicts with the prepared file; it was not overwritten.",
      );
    const publicResponse = await fetch(
      `${config.baseUrl}/${encodeKey(item.key)}`,
      { signal: AbortSignal.timeout(15000), redirect: "error" },
    );
    if (digest(await readBytes(publicResponse)) !== item.sha256)
      throw Error(
        "Public R2 artwork did not match the prepared file. No cutover SQL was generated.",
      );
    verified++;
  }
  const cutover = cutoverSql(manifest, config.baseUrl);
  fs.writeFileSync(path.join(directory, "cutover.sql"), cutover.sql);
  fs.writeFileSync(
    path.join(directory, "rollback.sql"),
    rollbackSql(manifest, config.baseUrl),
  );
  fs.writeFileSync(
    path.join(directory, "verified.json"),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        baseUrl: config.baseUrl,
        manifestSha256: digest(
          fs.readFileSync(path.join(directory, "manifest.json")),
        ),
        objects: verified,
        mediaRecords: cutover.assets.length,
        directReferences: cutover.direct.length,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        verified,
        mediaRecords: cutover.assets.length,
        directReferences: cutover.direct.length,
        cutover: ".qa/r2-media/cutover.sql",
        databaseChanged: false,
      },
      null,
      2,
    ),
  );
}
async function cutover(args) {
  const config = readR2Config({ publicUrl: true });
  const filename = path.join(directory, "manifest.json"),
    manifest = JSON.parse(fs.readFileSync(filename, "utf8"));
  validateManifest(manifest);
  const proof = JSON.parse(
    fs.readFileSync(path.join(directory, "verified.json"), "utf8"),
  );
  if (
    proof.baseUrl !== config.baseUrl ||
    proof.manifestSha256 !== digest(fs.readFileSync(filename)) ||
    proof.objects !== manifest.objects.length
  )
    throw Error(
      "The upload verification does not match the current plan and public address.",
    );
  const plan = cutoverSql(manifest, config.baseUrl);
  if (!args.includes("--apply")) {
    console.log(
      JSON.stringify(
        {
          mediaRecords: plan.assets.length,
          directReferences: plan.direct.length,
          databaseChanged: false,
          requiresApproval: true,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (
    !args.includes("--confirm-project") ||
    args[args.indexOf("--confirm-project") + 1] !== PROJECT ||
    projectRef() !== PROJECT
  )
    throw Error(
      "Explicit project confirmation is required after production approval.",
    );
  // Recheck the actual browser URLs immediately before the conditional commit.
  for (const object of manifest.objects)
    if (
      digest(
        await readBytes(
          await fetch(`${config.baseUrl}/${encodeKey(object.key)}`, {
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          }),
        ),
      ) !== object.sha256
    )
      throw Error(
        "Public image verification failed. Live references were not changed.",
      );
  const sqlFile = path.join(directory, "cutover.sql");
  fs.writeFileSync(sqlFile, plan.sql);
  cli(["db", "query", "--linked", "--file", sqlFile, "-o", "json"]);
  console.log(
    "Reviewed R2 URLs activated atomically. Original Supabase objects, paths and source hashes were preserved.",
  );
}
function rollbackSql(manifest, baseUrl) {
  const plan = cutoverSql(manifest, baseUrl);
  return (
    `-- Restore only reviewed delivery fields; never delete originals or restore whole content rows.\nbegin;\nset local lock_timeout='5s';\ndo $restore$\ndeclare item jsonb; current_row public.media_assets%rowtype; affected integer;\nbegin\n` +
    `for item in select value from jsonb_array_elements(${jsonSql(plan.assets)}) loop\n` +
    `select * into current_row from public.media_assets where id=item->>'id' for update;\n` +
    `if not found then raise exception 'A reviewed media row was removed'; end if;\n` +
    `if current_row.public_url is null and current_row.r2_key is null and current_row.r2_sha256 is null and current_row.r2_bytes is null then continue; end if;\n` +
    `if current_row.public_url is distinct from item->>'public_url' or current_row.r2_key is distinct from item->>'r2_key' or current_row.r2_sha256 is distinct from item->>'r2_sha256' or current_row.bucket_id is distinct from item->>'bucket_id' or current_row.object_path is distinct from item->>'object_path' then raise exception 'Delivery changed since cutover; review rollback'; end if;\n` +
    `update public.media_assets set public_url=null,r2_key=null,r2_sha256=null,r2_bytes=null where id=item->>'id';\nend loop;\n` +
    plan.direct
      .map((item) => {
        const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
        return `if exists(select 1 from public.${item.table} where id=${literal(item.id)}::uuid and image_url=${literal(item.old_url)}) then null; else\nupdate public.${item.table} set image_url=${literal(item.old_url)} where id=${literal(item.id)}::uuid and image_url=${literal(item.new_url)};\nget diagnostics affected=row_count; if affected<>1 then raise exception 'Direct image reference changed; review rollback'; end if; end if;\n`;
      })
      .join("") +
    `end;\n$restore$;\ncommit;\n`
  );
}
async function rollback(args) {
  const config = readR2Config({ publicUrl: true });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
  );
  validateManifest(manifest);
  const sqlFile = path.join(directory, "rollback.sql");
  fs.writeFileSync(sqlFile, rollbackSql(manifest, config.baseUrl));
  if (!args.includes("--apply")) {
    console.log("Reviewed conditional rollback prepared. No database changes.");
    return;
  }
  if (
    !args.includes("--confirm-project") ||
    args[args.indexOf("--confirm-project") + 1] !== PROJECT ||
    projectRef() !== PROJECT
  )
    throw Error("Explicit AceRadio project confirmation required.");
  cli(["db", "query", "--linked", "--file", sqlFile, "-o", "json"]);
  console.log(
    "Reviewed delivery references restored. Original objects and unrelated content preserved.",
  );
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "prepare") await prepare(args);
  else if (command === "upload") await upload(args);
  else if (command === "cutover") await cutover(args);
  else if (command === "rollback") await rollback(args);
  else
    throw Error(
      "Use prepare [--inventory file] [--download-missing], upload --confirm-bucket aceradio-media, or cutover [--apply --confirm-project project].",
    );
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = {
  optimize,
  validateManifest,
  cutoverSql,
  rollbackSql,
  readBytes,
  safePath,
};
