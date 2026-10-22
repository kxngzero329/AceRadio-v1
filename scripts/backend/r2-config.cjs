// Node/backend tooling only. This deliberately is NOT an Expo dotenv filename.
const fs = require("node:fs");
const path = require("node:path");
const ACCOUNT = "bc5f0307db1291ec21f84c8912720ef8";
const BUCKET = "aceradio-media";
function readR2Config({ credentials = false, publicUrl = false } = {}) {
  const filename = path.resolve(__dirname, "../../.env.r2.local");
  const local = fs.existsSync(filename)
    ? process.loadEnvFile
      ? require("node:util").parseEnv(fs.readFileSync(filename, "utf8"))
      : Object.fromEntries(
          fs
            .readFileSync(filename, "utf8")
            .split(/\r?\n/)
            .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
            .map((line) => {
              const i = line.indexOf("=");
              return [
                line.slice(0, i),
                line
                  .slice(i + 1)
                  .trim()
                  .replace(/^(['"])(.*)\1$/, "$2"),
              ];
            }),
        )
    : {};
  const get = (name) => process.env[name] || local[name] || "";
  const accountId = get("R2_ACCOUNT_ID") || ACCOUNT;
  const bucket = get("R2_BUCKET_NAME") || BUCKET;
  const endpoint =
    get("R2_ENDPOINT") || `https://${accountId}.r2.cloudflarestorage.com`;
  if (
    accountId !== ACCOUNT ||
    bucket !== BUCKET ||
    endpoint !== `https://${ACCOUNT}.r2.cloudflarestorage.com`
  )
    throw Error(
      "R2 target must match the reviewed AceRadio account and aceradio-media bucket.",
    );
  const accessKeyId = get("R2_ACCESS_KEY_ID"),
    secretAccessKey = get("R2_SECRET_ACCESS_KEY");
  let baseUrl = get("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
  if (baseUrl) {
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw Error("R2_PUBLIC_BASE_URL must be the public HTTPS image address.");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.hostname.endsWith(".r2.cloudflarestorage.com")
    )
      throw Error(
        "Use a public R2 HTTPS address, not the private S3 endpoint.",
      );
    baseUrl = parsed.href.replace(/\/+$/, "");
  }
  if (credentials && (!accessKeyId || !secretAccessKey))
    throw Error(
      "Add bucket-scoped R2 credentials to ignored .env.r2.local. Never paste them into chat.",
    );
  if (publicUrl && !baseUrl)
    throw Error(
      "Set R2_PUBLIC_BASE_URL in .env.r2.local to the public image address.",
    );
  return { accountId, bucket, endpoint, accessKeyId, secretAccessKey, baseUrl };
}
module.exports = { readR2Config, ACCOUNT, BUCKET };
