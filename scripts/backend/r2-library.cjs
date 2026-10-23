// Node-only, explicit administrative migration. No private R2 key is read locally.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { cli, projectRef, root } = require("./linked-project.cjs");
const { readBytes } = require("./r2-media.cjs");
const PROJECT = "dbgpfqyighcaquxwzkfe";
const dir = path.join(root, ".qa/r2-library");
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => literal(JSON.stringify(value)) + "::jsonb";
function buildLibraryPlan(inventory) {
  const groups = new Map();
  for (const asset of inventory.assets) {
    if (!asset.public_url || !/^[a-f0-9]{64}$/.test(asset.r2_sha256))
      throw Error("Every image must already be verified in R2.");
    const url = new URL(asset.public_url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" + asset.r2_key ||
      !Number.isSafeInteger(asset.r2_bytes) ||
      asset.r2_bytes < 1
    )
      throw Error("Unreviewed R2 reference.");
    let category = {
      "show-artwork": "headshots",
      "presenter-photos": "headshots",
      banners: "show-banners",
    }[asset.bucket_id];
    if (!category && asset.bucket_id === "station-media") {
      const usedIn = ["events", "announcements"].filter((table) =>
        inventory[table].some((row) => row.image_url === asset.public_url),
      );
      if (usedIn.length === 1) category = usedIn[0];
      else if (!usedIn.length && asset.id.startsWith("team:"))
        category = "headshots";
      else throw Error("A station image needs explicit category review.");
    }
    if (!category) throw Error("Unknown image category.");
    const extension = asset.r2_key.split(".").pop();
    if (!["jpg", "png", "webp"].includes(extension))
      throw Error("Unsupported R2 image.");
    const key = `${category}/${asset.r2_sha256}.${extension}`;
    let group = groups.get(key);
    if (!group)
      groups.set(
        key,
        (group = {
          key,
          sourceKey: asset.r2_key,
          sha256: asset.r2_sha256,
          bytes: asset.r2_bytes,
          mimeType: `image/${extension === "jpg" ? "jpeg" : extension}`,
          publicUrl: url.origin + "/" + key,
          assets: [],
        }),
      );
    if (
      group.bytes !== asset.r2_bytes ||
      group.publicUrl !== url.origin + "/" + key
    )
      throw Error("Conflicting duplicate image metadata.");
    group.assets.push(asset);
  }
  const updates = [],
    aliases = [],
    direct = [];
  for (const group of groups.values()) {
    group.assets.sort(
      (a, b) =>
        Number(!a.id.startsWith("presenter:")) -
          Number(!b.id.startsWith("presenter:")) || a.id.localeCompare(b.id),
    );
    const canonical = group.assets[0];
    updates.push({
      id: canonical.id,
      key: group.key,
      url: group.publicUrl,
      sha256: group.sha256,
      bytes: group.bytes,
    });
    for (const asset of group.assets) {
      if (asset.id !== canonical.id)
        aliases.push({ id: asset.id, canonical: canonical.id });
      for (const table of ["events", "announcements"])
        for (const row of inventory[table])
          if (row.image_url === asset.public_url) {
            if (!group.key.startsWith(table + "/"))
              throw Error("A direct image needs its own category.");
            direct.push({
              table,
              id: row.id,
              updated_at: row.updated_at,
              old: row.image_url,
              url: group.publicUrl,
            });
          }
    }
  }
  return {
    version: 1,
    project: PROJECT,
    assets: inventory.assets,
    objects: inventory.objects,
    copies: [...groups.values()].map(({ assets, ...copy }) => copy),
    updates,
    aliases,
    direct,
  };
}
function librarySql(plan) {
  return `begin;
set local lock_timeout='5s';
lock table public.media_assets,public.shows,public.presenters,public.banners in share row exclusive mode;
do $library$
declare item jsonb; fk record;
begin
 if (select count(*) from public.media_assets)=${plan.updates.length}
 and not exists(select 1 from jsonb_array_elements(${json(plan.updates)}) x left join public.media_assets m on m.id=x->>'id' where m.id is null or m.r2_key is distinct from x->>'key' or m.public_url is distinct from x->>'url') then return; end if;
 if (select count(*) from public.media_assets)<>${plan.assets.length} then raise exception 'Media changed since review'; end if;
 for item in select value from jsonb_array_elements(${json(plan.assets)}) loop
  if not exists(select 1 from public.media_assets m where m.id=item->>'id' and m.updated_at=(item->>'updated_at')::timestamptz and m.r2_key=item->>'r2_key' and m.r2_sha256=item->>'r2_sha256' and m.public_url=item->>'public_url') then raise exception 'Media changed since review'; end if;
 end loop;
 for item in select value from jsonb_array_elements(${json(plan.aliases)}) loop
  for fk in select n.nspname,c.relname,a.attname from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=k.conkey[1] where k.contype='f' and k.confrelid='public.media_assets'::regclass and cardinality(k.conkey)=1 loop
   execute format('update %I.%I set %I=$1 where %I=$2',fk.nspname,fk.relname,fk.attname,fk.attname) using item->>'canonical',item->>'id';
  end loop;
  delete from public.media_assets where id=item->>'id';
 end loop;
 for item in select value from jsonb_array_elements(${json(plan.updates)}) loop
  update public.media_assets set public_url=item->>'url',r2_key=item->>'key' where id=item->>'id';
 end loop;
 ${plan.direct
   .map(
     (
       row,
     ) => `update public.${row.table} set image_url=${literal(row.url)} where id=${literal(row.id)}::uuid and image_url=${literal(row.old)} and updated_at=${literal(row.updated_at)}::timestamptz;
 if not found then raise exception 'Direct image changed since review'; end if;`,
   )
   .join("\n")}
end;
$library$;
commit;
`;
}
async function verify(plan) {
  for (const copy of plan.copies) {
    const response = await fetch(copy.publicUrl, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const bytes = await readBytes(response);
    if (digest(bytes) !== copy.sha256 || bytes.length !== copy.bytes)
      throw Error("A canonical R2 image failed verification.");
  }
}
async function backup(plan) {
  fs.mkdirSync(path.join(dir, "originals"), { recursive: true });
  const catalogue = JSON.parse(
    fs.readFileSync(path.join(root, "supabase/import/catalogue.json")),
  );
  const backups = [];
  for (const object of plan.objects) {
    const source = catalogue.files.find(
      (f) =>
        f.bucket_id === object.bucket_id &&
        f.object_path === object.object_path,
    );
    const asset = plan.assets.find(
      (a) =>
        a.bucket_id === object.bucket_id &&
        a.object_path === object.object_path,
    );
    let bytes;
    if (source && fs.existsSync(path.join(root, source.local_path)))
      bytes = fs.readFileSync(path.join(root, source.local_path));
    if (
      !bytes ||
      bytes.length !== object.bytes ||
      (asset?.sha256 && digest(bytes) !== asset.sha256)
    ) {
      const url =
        asset?.sha256 === asset?.r2_sha256
          ? asset.public_url
          : `https://${PROJECT}.supabase.co/storage/v1/object/public/${object.bucket_id}/${object.object_path.split("/").map(encodeURIComponent).join("/")}`;
      bytes = await readBytes(
        await fetch(url, {
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        }),
      );
    }
    if (
      bytes.length !== object.bytes ||
      (asset?.sha256 && digest(bytes) !== asset.sha256)
    )
      throw Error("Original backup verification failed.");
    const sha = digest(bytes),
      file = path.join(dir, "originals", sha);
    fs.writeFileSync(file, bytes);
    backups.push({ ...object, sha256: sha, file: path.relative(root, file) });
  }
  fs.writeFileSync(
    path.join(dir, "original-backups.json"),
    JSON.stringify(backups, null, 2),
  );
  return backups;
}
async function main() {
  if (projectRef() !== PROJECT) throw Error("Unexpected linked project.");
  const [command] = process.argv.slice(2);
  const planFile = path.join(dir, "plan.json");
  if (command === "plan") {
    const inventory = JSON.parse(
      fs.readFileSync(path.join(dir, "inventory-before.json")),
    ).rows[0].inventory;
    const plan = buildLibraryPlan(inventory);
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
    fs.writeFileSync(path.join(dir, "cutover.sql"), librarySql(plan));
    console.log(
      JSON.stringify({
        mediaBefore: plan.assets.length,
        sharedMedia: plan.updates.length,
        duplicateRecords: plan.aliases.length,
        filesToCopy: plan.copies.length,
        storageFilesToBackUp: plan.objects.length,
        remoteWrites: false,
      }),
    );
    return;
  }
  const plan = JSON.parse(fs.readFileSync(planFile));
  if (command === "copy") {
    if (
      !process.argv.includes("--apply") ||
      process.argv[process.argv.indexOf("--confirm-project") + 1] !== PROJECT
    )
      throw Error("Explicit project confirmation required.");
    const secret = crypto.randomBytes(32).toString("hex"),
      secretFile = path.join(dir, "maintenance.env");
    fs.writeFileSync(secretFile, `MEDIA_MAINTENANCE_SECRET=${secret}\n`, {
      mode: 0o600,
    });
    const proof = [];
    try {
      cli([
        "secrets",
        "set",
        "--env-file",
        secretFile,
        "--project-ref",
        PROJECT,
      ]);
      cli([
        "functions",
        "deploy",
        "media-maintenance",
        "--project-ref",
        PROJECT,
        "--use-api",
        "--no-verify-jwt",
      ]);
      for (const copy of plan.copies) {
        const response = await fetch(
          `https://${PROJECT}.supabase.co/functions/v1/media-maintenance`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${secret}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(copy),
            signal: AbortSignal.timeout(60000),
          },
        );
        if (!response.ok)
          throw Error("Private R2 copy failed. No references were changed.");
        const result = await response.json();
        if (
          result.key !== copy.key ||
          result.sha256 !== copy.sha256 ||
          result.bytes !== copy.bytes
        )
          throw Error("Copy verification mismatch.");
        proof.push(result);
        fs.writeFileSync(
          path.join(dir, "copy-proof.json"),
          JSON.stringify(proof, null, 2),
        );
      }
      await verify(plan);
      console.log(
        JSON.stringify({
          copiedAndVerified: proof.length,
          credentialsKeptOnServer: true,
        }),
      );
    } finally {
      try {
        cli([
          "functions",
          "delete",
          "media-maintenance",
          "--project-ref",
          PROJECT,
          "--yes",
        ]);
      } finally {
        try {
          cli([
            "secrets",
            "unset",
            "MEDIA_MAINTENANCE_SECRET",
            "--project-ref",
            PROJECT,
          ]);
        } finally {
          fs.rmSync(secretFile, { force: true });
        }
      }
    }
    return;
  }
  if (command === "verify") {
    await verify(plan);
    console.log("Canonical R2 images verified.");
    return;
  }
  if (command === "backup") {
    console.log(
      JSON.stringify({
        verifiedLocalOriginalBackups: (await backup(plan)).length,
      }),
    );
    return;
  }
  if (command === "cutover") {
    if (
      !process.argv.includes("--apply") ||
      !process.argv.includes("--confirm-project") ||
      process.argv[process.argv.indexOf("--confirm-project") + 1] !== PROJECT
    )
      throw Error("Explicit reviewed project confirmation required.");
    await verify(plan);
    cli([
      "db",
      "query",
      "--linked",
      "--file",
      path.join(dir, "cutover.sql"),
      "-o",
      "json",
    ]);
    console.log("Canonical R2 references and shared media records activated.");
    return;
  }
  if (command === "cleanup") {
    if (
      !process.argv.includes("--confirm-current-r2-clients") ||
      !process.argv.includes("--apply") ||
      process.argv[process.argv.indexOf("--confirm-project") + 1] !== PROJECT
    )
      throw Error("Confirmed current-client support and project required.");
    await verify(plan);
    const backups = JSON.parse(
      fs.readFileSync(path.join(dir, "original-backups.json")),
    );
    for (const file of backups)
      if (digest(fs.readFileSync(path.join(root, file.file))) !== file.sha256)
        throw Error("Backup is missing or changed.");
    const current = JSON.parse(
      cli([
        "db",
        "query",
        "--linked",
        "--file",
        path.join(root, "scripts/backend/r2-inventory.sql"),
        "-o",
        "json",
      ]),
    ).rows[0].inventory;
    if (
      current.assets.length !== plan.updates.length ||
      current.assets.some(
        (a) =>
          !plan.updates.some(
            (p) =>
              p.id === a.id && p.key === a.r2_key && p.url === a.public_url,
          ),
      )
    )
      throw Error("Current references differ from verified plan.");
    if (
      [...current.events, ...current.announcements].some((row) =>
        row.image_url.includes(".supabase.co/storage/"),
      )
    )
      throw Error("A direct Supabase image reference remains.");
    for (const file of current.objects)
      if (
        !backups.some(
          (b) =>
            b.bucket_id === file.bucket_id &&
            b.object_path === file.object_path &&
            b.bytes === file.bytes,
        )
      )
        throw Error("An unreviewed Storage file exists.");
    const paths = current.objects.map(
      (file) => `ss:///${file.bucket_id}/${file.object_path}`,
    );
    if (paths.length)
      cli(["storage", "rm", ...paths, "--linked", "--experimental", "--yes"]);
    const after = JSON.parse(
      cli([
        "db",
        "query",
        "--linked",
        "--file",
        path.join(root, "scripts/backend/r2-inventory.sql"),
        "-o",
        "json",
      ]),
    ).rows[0].inventory;
    if (after.objects.length) throw Error("Storage cleanup needs review.");
    fs.writeFileSync(
      path.join(dir, "inventory-after.json"),
      JSON.stringify(after, null, 2),
    );
    console.log(
      JSON.stringify({
        removedSupabaseImageFiles: paths.length,
        remainingSupabaseImageFiles: 0,
        sharedMediaRecords: after.assets.length,
      }),
    );
    return;
  }
  throw Error("Use plan, verify, backup, cutover or cleanup.");
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { buildLibraryPlan, librarySql };
