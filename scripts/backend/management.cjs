// Node-only Management API helper. No credentials are logged or written to disk.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { projectRef } = require("./linked-project.cjs");
function accessToken() {
  let token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token && process.platform === "win32") {
    const code = `Add-Type @'
using System; using System.Runtime.InteropServices;
public static class AceAuthCredential {
[StructLayout(LayoutKind.Sequential)] public struct Credential { public uint Flags; public uint Type; public IntPtr TargetName; public IntPtr Comment; public long LastWritten; public uint Size; public IntPtr Blob; public uint Persist; public uint Count; public IntPtr Attributes; public IntPtr Alias; public IntPtr User; }
[DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool Read(string target,uint type,uint flags,out IntPtr pointer);
[DllImport("advapi32.dll")] public static extern void CredFree(IntPtr pointer);
}
'@
$pointer=[IntPtr]::Zero
try { if (-not [AceAuthCredential]::Read('Supabase CLI:supabase',1,0,[ref]$pointer)) { exit 1 }; $record=[Runtime.InteropServices.Marshal]::PtrToStructure($pointer,[type][AceAuthCredential+Credential]); $bytes=New-Object byte[] $record.Size; [Runtime.InteropServices.Marshal]::Copy($record.Blob,$bytes,0,$bytes.Length); [Console]::Write([Text.Encoding]::UTF8.GetString($bytes)) } finally { if ($pointer -ne [IntPtr]::Zero) { [AceAuthCredential]::CredFree($pointer) } }`;
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", code],
      { encoding: "utf8", windowsHide: true, timeout: 15000 },
    );
    if (result.status === 0) token = result.stdout.trim();
  }
  if (!token) {
    const file = path.join(os.homedir(), ".supabase", "access-token");
    if (fs.existsSync(file)) token = fs.readFileSync(file, "utf8").trim();
  }
  if (!/^sbp_(oauth_)?[a-f0-9]{40}$/.test(token ?? ""))
    throw Error(
      "Supabase Management access is unavailable. Log in to the CLI or provide SUPABASE_ACCESS_TOKEN to this backend-only process.",
    );
  return token;
}
async function management(route, method = "GET", body) {
  if (!["/config/auth"].includes(route))
    throw Error("Unsupported management operation.");
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef()}${route}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${accessToken()}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw Error(
      `Supabase Auth configuration failed (HTTP ${response.status}). Check SMTP setup and project access. Credentials were not printed.`,
    );
  return response.json();
}
module.exports = { management };
