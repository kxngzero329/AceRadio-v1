const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { manifest, root, tables } = require("./seed.cjs");
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
async function main() {
  if (process.argv.includes("--apply"))
    throw Error(
      "Legacy Supabase image imports are retired. Use the R2 admin library; no records or files were changed.",
    );
  for (const file of manifest.files) {
    const absolute = path.resolve(root, file.local_path);
    if (
      !absolute.startsWith(root + path.sep) ||
      sha(fs.readFileSync(absolute)) !== file.sha256
    )
      throw Error("Missing or changed source image: " + file.local_path);
  }
  console.log("Verified source files:", manifest.files.length);
  console.log(
    "Records:",
    Object.fromEntries(
      tables.map((name) => [name, manifest.records[name].length]),
    ),
  );
  if (!process.argv.includes("--apply")) {
    console.log("Dry run only. No network writes.");
    return;
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
