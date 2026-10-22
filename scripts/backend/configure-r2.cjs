// Backend secrets only. No values are logged or passed as command-line arguments.
const fs = require("node:fs");
const path = require("node:path");
const { cli, root, projectRef } = require("./linked-project.cjs");
const { readR2Config } = require("./r2-config.cjs");
const apply = process.argv.includes("--apply");
if (!apply) {
  const config = readR2Config();
  console.log(
    JSON.stringify({
      bucket: config.bucket,
      account: config.accountId,
      publicAddressConfigured: !!config.baseUrl,
      credentialsConfigured: !!config.accessKeyId && !!config.secretAccessKey,
      remoteChanges: false,
    }),
  );
  process.exit(0);
}
const project = projectRef();
if (
  !process.argv.includes("--confirm-project") ||
  process.argv[process.argv.indexOf("--confirm-project") + 1] !== project ||
  project !== "dbgpfqyighcaquxwzkfe"
)
  throw Error("Explicit AceRadio project confirmation is required.");
const config = readR2Config({ credentials: true, publicUrl: true });
const values = {
  R2_ACCOUNT_ID: config.accountId,
  R2_BUCKET_NAME: config.bucket,
  R2_ENDPOINT: config.endpoint,
  R2_ACCESS_KEY_ID: config.accessKeyId,
  R2_SECRET_ACCESS_KEY: config.secretAccessKey,
  R2_PUBLIC_BASE_URL: config.baseUrl,
};
if (Object.values(values).some((value) => /[\r\n]/.test(value)))
  throw Error("Invalid credential file format.");
const temporary = fs.mkdtempSync(path.join(root, ".qa/r2-secrets-"));
const filename = path.join(temporary, "secrets.env");
try {
  fs.writeFileSync(
    filename,
    Object.entries(values)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(""),
    { mode: 0o600 },
  );
  cli(["secrets", "set", "--project-ref", project, "--env-file", filename]);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log(
  "Only the six R2 server settings were configured. Existing Supabase, push and listener credentials were not changed.",
);
