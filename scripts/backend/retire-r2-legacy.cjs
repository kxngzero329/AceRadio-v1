// Server-side R2 cleanup: credentials remain in Edge secrets. The owner must
// explicitly retire cached legacy URLs; default mode only reviews inventory.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { cli, projectRef, root } = require("./linked-project.cjs");
const PROJECT = "dbgpfqyighcaquxwzkfe";
const dir = path.join(root, ".qa/shared-headshots");
const legacy = /^(show-artwork|presenter-photos|banners|station-media)\//;
function retirementPlan(keys, original, current) {
  const pending = [];
  for (const sourceKey of keys.filter((k) => legacy.test(k))) {
    const old = original.assets.find((a) => a.r2_key === sourceKey);
    if (!old)
      throw Error(
        "Unknown legacy object requires explicit review; nothing is deleted.",
      );
    const copied = original.copies.find(
      (c) =>
        c.sha256 === old.r2_sha256 &&
        c.sourceKey.split(".").pop() === sourceKey.split(".").pop() &&
        c.key.startsWith(
          old.bucket_id === "banners" ? "show-banners/" : "headshots/",
        ),
    );
    if (
      !copied ||
      !keys.includes(copied.key) ||
      !current.assets.some(
        (a) =>
          a.r2_key === copied.key &&
          a.r2_sha256 === old.r2_sha256 &&
          a.r2_bytes === old.r2_bytes,
      )
    )
      throw Error("Verified canonical replacement is missing.");
    if (
      current.assets.some(
        (a) =>
          a.r2_key === sourceKey || a.public_url?.endsWith("/" + sourceKey),
      )
    )
      throw Error("A live image reference still uses a legacy key.");
    for (const row of [
      ...(current.events ?? []),
      ...(current.announcements ?? []),
    ])
      if (row.image_url?.endsWith("/" + sourceKey))
        throw Error("A direct live image still uses a legacy key.");
    pending.push({
      sourceKey,
      key: copied.key,
      sha256: old.r2_sha256,
      bytes: old.r2_bytes,
      mimeType: copied.mimeType,
    });
  }
  return pending;
}
async function main() {
  if (projectRef() !== PROJECT) throw Error("Unexpected linked project.");
  const apply = process.argv.includes("--apply");
  if (
    apply &&
    (!process.argv.includes("--confirm-refreshed-test-clients") ||
      process.argv[process.argv.indexOf("--confirm-project") + 1] !== PROJECT)
  )
    throw Error("Project and legacy-cache retirement confirmation required.");
  fs.mkdirSync(dir, { recursive: true });
  if (apply && fs.existsSync(path.join(dir, "r2-before-delete.json"))) {
    const archive = path.join(dir, "attempt-" + Date.now());
    fs.mkdirSync(archive);
    for (const file of [
      "r2-before-delete.json",
      "r2-after-delete.json",
      "retirement-plan.json",
      "retirement-proof.json",
    ])
      if (fs.existsSync(path.join(dir, file)))
        fs.copyFileSync(path.join(dir, file), path.join(archive, file));
  }
  const original = JSON.parse(
    fs.readFileSync(path.join(root, ".qa/r2-library/plan.json")),
  );
  // Fresh guard: no image row or direct image reference may still use old keys.
  const sqlFile = path.join(dir, "retirement-inventory.sql");
  fs.writeFileSync(
    sqlFile,
    "select jsonb_build_object('assets',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from public.media_assets m),'events',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'image_url',image_url)),'[]'::jsonb) from public.events),'announcements',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'image_url',image_url)),'[]'::jsonb) from public.announcements)) as inventory;",
  );
  const current = JSON.parse(
    cli(["db", "query", "--linked", "--file", sqlFile, "-o", "json"]),
  ).rows[0].inventory;
  fs.writeFileSync(
    path.join(dir, "retirement-db.json"),
    JSON.stringify(current, null, 2),
  );
  const secret = crypto.randomBytes(32).toString("hex");
  const envFile = path.join(dir, "maintenance.env");
  fs.writeFileSync(envFile, `MEDIA_MAINTENANCE_SECRET=${secret}\n`, {
    mode: 0o600,
  });
  const call = async (body) => {
    const response = await fetch(
      `https://${PROJECT}.supabase.co/functions/v1/media-maintenance`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(55000),
      },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const code =
        typeof result.code === "string" && /^[a-z_]{1,64}$/.test(result.code)
          ? result.code
          : "unavailable";
      throw Error(
        `Private media maintenance failed (${response.status}, ${code}); inspect saved proof and inventory before retrying.`,
      );
    }
    return response.json();
  };
  try {
    cli(["secrets", "set", "--env-file", envFile, "--project-ref", PROJECT]);
    cli([
      "functions",
      "deploy",
      "media-maintenance",
      "--project-ref",
      PROJECT,
      "--use-api",
      "--no-verify-jwt",
    ]);
    const before = await call({ operation: "inventory" });
    fs.writeFileSync(
      path.join(dir, apply ? "r2-before-delete.json" : "r2-inventory.json"),
      JSON.stringify(before, null, 2),
    );
    const pending = retirementPlan(before.keys, original, current);
    fs.writeFileSync(
      path.join(dir, "retirement-plan.json"),
      JSON.stringify(pending, null, 2),
    );
    console.log(
      JSON.stringify({
        legacyObjects: pending.length,
        canonicalObjects: before.keys.filter((k) =>
          /^(headshots|show-banners|events|announcements)\//.test(k),
        ).length,
        catalogueObjects: before.keys.filter((k) =>
          k.startsWith("public-content/"),
        ).length,
        apply,
      }),
    );
    if (!apply) return;
    const proof = [];
    for (const item of pending) {
      proof.push(await call({ ...item, operation: "retire" }));
      fs.writeFileSync(
        path.join(dir, "retirement-proof.json"),
        JSON.stringify(proof, null, 2),
      );
    }
    const after = await call({ operation: "inventory" });
    fs.writeFileSync(
      path.join(dir, "r2-after-delete.json"),
      JSON.stringify(after, null, 2),
    );
    if (after.keys.some((k) => legacy.test(k)))
      throw Error("Legacy prefixes still contain objects.");
    const removed = new Set(pending.map((p) => p.sourceKey));
    if (
      before.keys.some(
        (k) =>
          !k.startsWith("public-content/") &&
          !removed.has(k) &&
          !after.keys.includes(k),
      )
    )
      throw Error("Unexpected R2 inventory change; inspect saved proof.");
    console.log(
      JSON.stringify({
        deleted: proof.filter((p) => p.removed).length,
        legacyRemaining: 0,
        preserved: after.keys.length,
      }),
    );
  } finally {
    let cleanupError;
    try {
      cli([
        "functions",
        "delete",
        "media-maintenance",
        "--project-ref",
        PROJECT,
        "--yes",
      ]);
    } catch (e) {
      cleanupError = e;
    }
    try {
      cli([
        "secrets",
        "unset",
        "MEDIA_MAINTENANCE_SECRET",
        "--project-ref",
        PROJECT,
      ]);
    } catch (e) {
      cleanupError = e;
    }
    fs.rmSync(envFile, { force: true });
    if (cleanupError)
      throw Error("Temporary maintenance cleanup needs verification.");
  }
}
module.exports = { retirementPlan };
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
