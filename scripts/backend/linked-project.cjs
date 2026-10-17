// Node-only CLI helpers. Never import this directory into the mobile application.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
function projectRef() {
  const ref = fs
    .readFileSync(path.join(root, "supabase/.temp/project-ref"), "utf8")
    .trim();
  if (!/^[a-z]{20}$/.test(ref)) throw Error("Invalid Supabase project link.");
  return ref;
}
function cli(args) {
  // Windows .cmd shims cannot be spawned as executables without a shell. Prefer
  // the installed CLI; on other platforms retain the existing npx fallback.
  let result = spawnSync("supabase", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120000,
  });
  if (result.error?.code === "ENOENT" && process.platform !== "win32")
    result = spawnSync("npx", ["--yes", "supabase", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000,
    });
  // CLI output can contain credentials; never include stdout/stderr in errors.
  if (result.status !== 0)
    throw Error(
      "Supabase CLI request failed. Check your CLI login and project link.",
    );
  return result.stdout;
}
function projectKey(privileged = false) {
  const reveal =
    privileged && cli(["projects", "api-keys", "--help"]).includes("--reveal");
  const response = JSON.parse(
    cli([
      "projects",
      "api-keys",
      "--project-ref",
      projectRef(),
      "--output",
      "json",
      ...(reveal ? ["--reveal"] : []),
    ]),
  );
  const keys = Array.isArray(response)
    ? response
    : (response.rows ?? response.api_keys);
  if (!Array.isArray(keys)) throw Error("Unsupported CLI key response.");
  const usable = keys.filter(
    (key) =>
      typeof key.api_key === "string" &&
      (/^sb_(secret|publishable)_[A-Za-z0-9_-]{20,}$/.test(key.api_key) ||
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key.api_key)),
  );
  const candidate = privileged
    ? (usable.find(
        (key) => key.type === "secret" && key.api_key?.startsWith("sb_secret_"),
      ) ?? usable.find((key) => key.name === "service_role"))
    : (usable.find(
        (key) =>
          key.type === "publishable" ||
          key.api_key?.startsWith("sb_publishable_"),
      ) ?? usable.find((key) => key.name === "anon"));
  if (
    !candidate?.api_key ||
    candidate.api_key.includes("...") ||
    candidate.api_key.includes("•")
  )
    throw Error("Required project key is unavailable.");
  return candidate.api_key;
}
module.exports = { cli, projectKey, projectRef, root };
