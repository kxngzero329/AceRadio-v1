const fs = require("node:fs");
const path = require("node:path");
const { management } = require("./management.cjs");
const { root, projectRef } = require("./linked-project.cjs");
async function main() {
  const current = await management("/config/auth");
  const smtp = !!current.smtp_host;
  const securityOnly = process.argv.includes("--security-only");
  console.log(
    JSON.stringify({
      smtp_configured: smtp,
      confirmation_enabled: !current.mailer_autoconfirm,
      otp_length: current.mailer_otp_length,
      otp_expiry_seconds: current.mailer_otp_exp,
      email_limit_hour: current.rate_limit_email_sent,
    }),
  );
  if (!process.argv.includes("--apply")) {
    console.log(
      "Read only. Use --apply --confirm-project <ref> after reviewing setup.",
    );
    return;
  }
  const confirmed = process.argv[process.argv.indexOf("--confirm-project") + 1];
  if (!process.argv.includes("--confirm-project") || confirmed !== projectRef())
    throw Error("Explicit project confirmation is required.");
  if (!smtp && !securityOnly)
    throw Error(
      "Configure a production SMTP provider in Supabase first. Code templates cannot be enabled with the default free-tier sender.",
    );
  const changes = {
    mailer_autoconfirm: false,
    password_min_length: 10,
    password_required_characters:
      "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789",
    mailer_otp_length: 6,
    mailer_otp_exp: 600,
    smtp_max_frequency: 60,
    mfa_totp_enroll_enabled: true,
    mfa_totp_verify_enabled: true,
  };
  if (!securityOnly)
    Object.assign(changes, {
      mailer_subjects_confirmation: "Your AceRadio verification code",
      mailer_templates_confirmation_content: fs.readFileSync(
        path.join(root, "supabase/templates/confirmation.html"),
        "utf8",
      ),
      mailer_subjects_recovery: "Reset your AceRadio password",
      mailer_templates_recovery_content: fs.readFileSync(
        path.join(root, "supabase/templates/recovery.html"),
        "utf8",
      ),
    });
  const backup = Object.fromEntries(
    Object.keys(changes).map((key) => [key, current[key]]),
  );
  const directory = path.join(root, ".qa/supabase");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, `auth-before-${Date.now()}.json`),
    JSON.stringify(backup, null, 2),
    { mode: 0o600 },
  );
  await management("/config/auth", "PATCH", changes);
  const after = await management("/config/auth");
  for (const [key, value] of Object.entries(changes))
    if (after[key] !== value)
      throw Error("Auth verification failed for setting: " + key);
  if (!securityOnly) {
    const file = path.join(root, ".env.local");
    let env = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    env = /^EXPO_PUBLIC_AUTH_EMAIL_CODES_READY=/m.test(env)
      ? env.replace(
          /^EXPO_PUBLIC_AUTH_EMAIL_CODES_READY=.*$/m,
          "EXPO_PUBLIC_AUTH_EMAIL_CODES_READY=true",
        )
      : env.trimEnd() + "\nEXPO_PUBLIC_AUTH_EMAIL_CODES_READY=true\n";
    fs.writeFileSync(file, env, { mode: 0o600 });
  }
  console.log(
    securityOnly
      ? "Verified Auth security settings. Email-code signup/recovery remains gated until SMTP/templates are configured."
      : "Verified Auth settings/templates and enabled email-code flows in .env.local. Restart Metro; set the same public flag in EAS after testing delivery.",
  );
  console.log("Existing SMTP credentials and Auth rate quotas were preserved.");
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
