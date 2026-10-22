const fs = require("node:fs"),
  path = require("node:path");
const { cli, projectRef, root } = require("./linked-project.cjs");
const project = projectRef(),
  apply = process.argv.includes("--apply");
if (
  project !== "dbgpfqyighcaquxwzkfe" ||
  (apply &&
    process.argv[process.argv.indexOf("--confirm-project") + 1] !== project)
)
  throw Error("Confirm the reviewed AceRadio project.");
const work = fs.mkdtempSync(path.join(root, ".qa/content-deploy-"));
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
const migration = "20261022160000_public_content_delivery.sql";
fs.copyFileSync(
  path.join(root, "supabase/migrations", migration),
  path.join(target, "migrations", migration),
);
cli(["--workdir", work, "db", "push", "--linked", "--dry-run"]);
if (!apply) {
  console.log("Public delivery migration dry run passed. No changes applied.");
  process.exit(0);
}
cli(["--workdir", work, "db", "push", "--linked", "--yes"]);
for (const name of ["content-publish", "public-content"])
  cli([
    "functions",
    "deploy",
    name,
    "--project-ref",
    project,
    "--use-api",
    "--no-verify-jwt",
  ]);
console.log(
  "Public-content infrastructure deployed. Original content APIs, accounts, storage policies and push configuration were preserved.",
);
