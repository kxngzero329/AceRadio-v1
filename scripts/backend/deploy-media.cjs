// Same isolated-history workflow as push deployment. No content switch, object
// deletion, secret changes or unrelated migrations are performed by this script.
const fs = require("node:fs");
const path = require("node:path");
const { cli, projectRef, root } = require("./linked-project.cjs");
const apply = process.argv.includes("--apply");
const confirmed = process.argv[process.argv.indexOf("--confirm-project") + 1];
const project = projectRef();
if (
  project !== "dbgpfqyighcaquxwzkfe" ||
  (apply &&
    (!process.argv.includes("--confirm-project") || confirmed !== project))
)
  throw Error(
    "Explicit confirmation of the reviewed AceRadio project is required.",
  );
const workspace = fs.mkdtempSync(path.join(root, ".qa/media-deploy-"));
const supabase = path.join(workspace, "supabase");
fs.mkdirSync(path.join(supabase, ".temp"), { recursive: true });
fs.copyFileSync(
  path.join(root, "supabase/config.toml"),
  path.join(supabase, "config.toml"),
);
fs.cpSync(
  path.join(root, "supabase/templates"),
  path.join(supabase, "templates"),
  { recursive: true },
);
for (const file of fs.readdirSync(path.join(root, "supabase/.temp"))) {
  const source = path.join(root, "supabase/.temp", file);
  if (fs.statSync(source).isFile())
    fs.copyFileSync(source, path.join(supabase, ".temp", file));
}
cli(["--workdir", workspace, "migration", "fetch", "--linked"]);
const migration = "20261022100000_r2_media_delivery.sql";
fs.copyFileSync(
  path.join(root, "supabase/migrations", migration),
  path.join(supabase, "migrations", migration),
);
cli(["--workdir", workspace, "db", "push", "--linked", "--dry-run"]);
if (!apply) {
  console.log(
    "Dry run passed for " +
      migration +
      ". Apply only after approval; this command does not switch image URLs or configure R2 secrets.",
  );
  process.exit(0);
}
cli(["--workdir", workspace, "db", "push", "--linked", "--yes"]);
cli([
  "functions",
  "deploy",
  "media-upload",
  "--project-ref",
  project,
  "--use-api",
  "--no-verify-jwt",
]);
console.log(
  "Additive media migration and staff-authenticated upload function deployed. Image references, original objects and all other functions/settings are preserved.",
);
