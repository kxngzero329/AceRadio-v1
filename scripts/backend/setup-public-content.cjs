// Sets only the new publisher's credential/job. Never invokes push setup.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { cli, root, projectRef } = require("./linked-project.cjs");
async function main() {
  const project = projectRef();
  if (!process.argv.includes("--apply")) {
    console.log(
      "Dry run: would configure only CONTENT_PUBLISH_SECRET and the named R2 publication job.",
    );
    return;
  }
  if (
    project !== "dbgpfqyighcaquxwzkfe" ||
    process.argv[process.argv.indexOf("--confirm-project") + 1] !== project
  )
    throw Error("Confirm the reviewed AceRadio project.");
  const secret = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(secret).digest("hex");
  const directory = fs.mkdtempSync(
    path.join(root, ".qa/public-content-secrets-"),
  );
  const env = path.join(directory, "publisher.env"),
    sql = path.join(directory, "publisher.sql");
  try {
    fs.writeFileSync(env, `CONTENT_PUBLISH_SECRET=${secret}\n`, {
      mode: 0o600,
    });
    cli(["secrets", "set", "--project-ref", project, "--env-file", env]);
    fs.writeFileSync(
      sql,
      `begin;
update app_private.public_content_delivery set publisher_sha256='${hash}',lease_until='-infinity' where id;
do $vault$ declare existing uuid; begin
 select id into existing from vault.secrets where name='aceradio_public_content_publisher';
 if existing is null then perform vault.create_secret('${secret}','aceradio_public_content_publisher');
 else perform vault.update_secret(existing,'${secret}','aceradio_public_content_publisher'); end if;
end $vault$;
do $cron$ begin
 if exists(select 1 from cron.job where jobname='aceradio-public-content') then perform cron.unschedule('aceradio-public-content'); end if;
end $cron$;
select cron.schedule('aceradio-public-content','* * * * *',$job$
 select net.http_post(url:='https://${project}.supabase.co/functions/v1/content-publish',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='aceradio_public_content_publisher')),
 body:='{}'::jsonb,timeout_milliseconds:=50000);
$job$);
commit;`,
      { mode: 0o600 },
    );
    cli(["db", "query", "--linked", "--file", sql, "-o", "json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  const r = await fetch(
    `https://${project}.supabase.co/functions/v1/content-publish`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(55000),
    },
  );
  if (r.status !== 429 && !r.ok)
    throw Error(
      "Initial publication did not succeed. The scheduled job remains available for retry; no private values printed.",
    );
  console.log(
    r.status === 429
      ? "Publication job configured; another publisher holds the lease. Verify the public pointer after the next minute."
      : "Publication job configured and initial R2 snapshot published.",
  );
}
main().catch(() => {
  console.error(
    "Public publisher setup failed. Secrets/SQL/provider responses are not printed. Inspect the named job/function before retrying.",
  );
  process.exitCode = 1;
});
