// Deploy only this additive migration and push-dispatch. Never run push setup,
// change audiences/credentials, or apply unrelated website migrations.
const fs = require("node:fs"),
  path = require("node:path");
const { cli, projectRef, root } = require("./linked-project.cjs");
const apply = process.argv.includes("--apply"),
  project = projectRef();
if (
  project !== "dbgpfqyighcaquxwzkfe" ||
  (apply &&
    process.argv[process.argv.indexOf("--confirm-project") + 1] !== project)
)
  throw Error("Confirm the linked AceRadio project.");
fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
const work = fs.mkdtempSync(path.join(root, ".qa/push-batch-deploy-"));
try {
  const target = path.join(work, "supabase");
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(
    path.join(root, "supabase/config.toml"),
    path.join(target, "config.toml"),
  );
  fs.cpSync(path.join(root, "supabase/.temp"), path.join(target, ".temp"), {
    recursive: true,
  });
  fs.cpSync(
    path.join(root, "supabase/templates"),
    path.join(target, "templates"),
    { recursive: true },
  );
  cli(["--workdir", work, "migration", "fetch", "--linked"]);
  const migration = "20261023080000_push_worker_batching.sql";
  fs.copyFileSync(
    path.join(root, "supabase/migrations", migration),
    path.join(target, "migrations", migration),
  );
  cli(["--workdir", work, "db", "push", "--linked", "--dry-run"]);
  if (apply) {
    cli(["--workdir", work, "db", "push", "--linked", "--yes"]);
    cli([
      "functions",
      "deploy",
      "push-dispatch",
      "--project-ref",
      project,
      "--use-api",
      "--no-verify-jwt",
    ]);
    console.log(
      "Batched push migration and only push-dispatch deployed. Existing jobs, credentials, audience flags and minute schedules retained.",
    );
  } else
    console.log(
      "Batched push migration dry run passed. No production changes.",
    );
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
