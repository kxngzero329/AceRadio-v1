// Configure only the public client variables; never print credentials or unrelated settings.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { projectKey, projectRef, root } = require("./linked-project.cjs");
const authOnly = process.argv.includes("--auth-only");
const environments = [];
for (let index = 0; index < process.argv.length; index++)
  if (process.argv[index] === "--environment")
    environments.push(process.argv[index + 1]);
if (!environments.length) environments.push("preview");
if (
  !environments.every((name) =>
    ["development", "preview", "production"].includes(name),
  )
)
  throw Error("Unsupported EAS environment.");
if (!process.argv.includes("--apply")) {
  console.log(
    authOnly
      ? "Dry run. Would set only EXPO_PUBLIC_AUTH_EMAIL_CODES_READY in:"
      : "Dry run. Would set public content configuration and EXPO_PUBLIC_AUTH_EMAIL_CODES_READY in:",
    environments.join(", "),
  );
  process.exit(0);
}
const confirmed = process.argv[process.argv.indexOf("--confirm-project") + 1];
if (!process.argv.includes("--confirm-project") || confirmed !== projectRef())
  throw Error(
    "Explicit --confirm-project must match the linked Supabase project.",
  );
const projectId = JSON.parse(
  fs.readFileSync(path.join(root, "app.json"), "utf8"),
).expo.extra.eas.projectId;
function eas(args) {
  const npmCli =
    process.env.npm_execpath ??
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npm-cli.js",
    );
  const result = fs.existsSync(npmCli)
    ? spawnSync(
        process.execPath,
        [
          npmCli,
          "exec",
          "--yes",
          "--package=eas-cli@latest",
          "--",
          "eas",
          ...args,
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 120000,
          maxBuffer: 5 * 1024 * 1024,
        },
      )
    : spawnSync("npx", ["--yes", "eas-cli@latest", ...args], {
        cwd: root,
        encoding: "utf8",
        timeout: 120000,
        maxBuffer: 5 * 1024 * 1024,
      });
  if (result.status !== 0)
    throw Error(
      "EAS configuration failed. Check EAS login/project access; no credentials were printed.",
    );
  return result.stdout;
}
if (!eas(["project:info"]).includes(projectId))
  throw Error("Unexpected EAS project. Settings were not changed.");
const localEnv = fs.existsSync(path.join(root, ".env.local"))
  ? fs.readFileSync(path.join(root, ".env.local"), "utf8")
  : "";
const emailCodesReady = /^EXPO_PUBLIC_AUTH_EMAIL_CODES_READY=true\r?$/m.test(
  localEnv,
);
const values = {
  ...(authOnly
    ? {}
    : {
        EXPO_PUBLIC_SUPABASE_URL: `https://${projectRef()}.supabase.co`,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: projectKey(false),
        EXPO_PUBLIC_CONTENT_SOURCE: "supabase",
      }),
  EXPO_PUBLIC_AUTH_EMAIL_CODES_READY: String(emailCodesReady),
};
for (const [name, value] of Object.entries(values)) {
  eas([
    "env:set",
    ...environments.flatMap((environment) => ["--environment", environment]),
    "--name",
    name,
    "--value",
    value,
    "--type",
    "string",
    "--visibility",
    "plaintext",
    "--scope",
    "project",
    "--non-interactive",
    "--json",
  ]);
  console.log("Configured public variable:", name);
}
console.log("EAS environments configured:", environments.join(", "));
