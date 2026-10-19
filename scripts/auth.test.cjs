const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const ts = require("typescript");

function fixture(auth = {}) {
  const storage = new Map();
  let now = 100_000;
  class Clock extends Date {
    static now() {
      return now;
    }
  }
  const exports = {};
  const filename = path.join(__dirname, "../src/services/authActions.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const imports = {
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: {
        async getItem(key) {
          return storage.get(key) ?? null;
        },
        async setItem(key, value) {
          storage.set(key, value);
        },
      },
    },
    "expo-crypto": {
      CryptoDigestAlgorithm: { SHA256: "sha256" },
      async digestStringAsync(_, value) {
        return createHash("sha256").update(value).digest("hex");
      },
    },
    "@/services/authClient": {
      accountConfig: { url: "https://test.supabase.co" },
      getAuthClient: () => ({ auth }),
    },
  };
  new vm.Script(source, { filename }).runInNewContext({
    exports,
    Date: Clock,
    require(name) {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw Error("Unexpected import: " + name);
    },
  });
  return {
    ...exports,
    storage,
    advance: (ms) => {
      now += ms;
    },
  };
}
const signedUp = () => ({
  data: { user: { id: "listener" }, session: { user: { id: "listener" } } },
  error: null,
});

test("email/password signup returns an immediate session, with no email-delivery or display-name dependency", async () => {
  let request;
  const f = fixture({
    async signUp(value) {
      request = value;
      return signedUp();
    },
  });
  const result = await f.authActions.signUp(
    "  Listener@Example.com  ",
    " StrongPassword7 ",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(request)), {
    email: "listener@example.com",
    password: " StrongPassword7 ",
  });
  assert.equal(result.session.user.id, "listener");
  assert.ok(
    [...f.storage.keys()].every((key) => !key.includes("listener@example.com")),
  );
  assert.ok(
    [...f.storage.values()].every((value) => !value.includes("Password")),
  );
});

test("invalid signup input is rejected before a request or cooldown, without trimming passwords", async () => {
  let calls = 0;
  const f = fixture({
    async signUp() {
      calls++;
      return signedUp();
    },
  });
  await assert.rejects(
    f.authActions.signUp("invalid-email", "StrongPassword7"),
    /valid email/,
  );
  for (const password of [
    "short7A",
    "lowercase123456",
    "UPPERCASE123456",
    "NoNumbersHere",
    "Aa7".repeat(44),
  ])
    await assert.rejects(
      f.authActions.signUp("valid@example.com", password),
      /10 characters/,
    );
  assert.equal(calls, 0);
  assert.equal(f.storage.size, 0);
  await f.authActions.signUp("valid@example.com", "StrongPassword7");
  assert.equal(calls, 1);
});

test("registration without a session is recoverable and never reported as successful sign-in", async () => {
  const f = fixture({
    async signUp() {
      return { data: { user: { id: "listener" }, session: null }, error: null };
    },
  });
  await assert.rejects(
    f.authActions.signUp("valid@example.com", "StrongPassword7"),
    (error) => {
      assert.match(f.authErrorMessage(error), /Try signing in/);
      return true;
    },
  );
});

test("concurrent signup and rapid retries cannot create duplicate requests, while signin remains available", async () => {
  let release,
    calls = 0;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture({
    async signUp() {
      calls++;
      return pending;
    },
    async signInWithPassword() {
      return signedUp();
    },
  });
  const first = f.authActions.signUp("valid@example.com", "StrongPassword7");
  // Await a microtask until the first call has entered its network action.
  for (let i = 0; i < 10 && !calls; i++) await Promise.resolve();
  await assert.rejects(
    f.authActions.signUp("VALID@example.com", "StrongPassword7"),
    /current request/,
  );
  release(signedUp());
  await first;
  await assert.rejects(
    f.authActions.signUp("valid@example.com", "StrongPassword7"),
    /Please wait/,
  );
  assert.equal(
    (await f.authActions.signIn("valid@example.com", "StrongPassword7")).user
      .id,
    "listener",
  );
  f.advance(3001);
  await f.authActions.signUp("valid@example.com", "StrongPassword7");
  assert.equal(calls, 2);
});

test("failed requests release the in-flight guard and allow a retry after the short cooldown", async () => {
  let calls = 0;
  const f = fixture({
    async signUp() {
      if (++calls === 1) throw Error("Offline");
      return signedUp();
    },
  });
  await assert.rejects(
    f.authActions.signUp("valid@example.com", "StrongPassword7"),
    /Offline/,
  );
  f.advance(3001);
  assert.ok(
    (await f.authActions.signUp("valid@example.com", "StrongPassword7"))
      .session,
  );
});

test("existing accounts use their original password without applying new-signup strength rules", async () => {
  let request;
  const f = fixture({
    async signInWithPassword(value) {
      request = value;
      return signedUp();
    },
  });
  await f.authActions.signIn("  EXISTING@example.com ", "oldpass");
  assert.equal(request.email, "existing@example.com");
  assert.equal(request.password, "oldpass");
});

test("duplicate, invalid, unconfirmed and rate-limited accounts receive actionable messages without nonexistent email flows", () => {
  const f = fixture();
  assert.match(
    f.authErrorMessage({ code: "user_already_exists" }),
    /sign in instead/,
  );
  assert.match(
    f.authErrorMessage({ code: "invalid_credentials" }),
    /email or password is incorrect/,
  );
  assert.match(
    f.authErrorMessage({ code: "signup_disabled" }),
    /registration is currently unavailable/,
  );
  assert.match(f.authErrorMessage({ status: 429 }), /Too many attempts/);
  assert.match(
    f.authErrorMessage({ code: "email_not_confirmed" }),
    /contact AceRadio/,
  );
  assert.doesNotMatch(
    f.authErrorMessage({ code: "email_not_confirmed" }),
    /request a code|Verify email/,
  );
});

test("the installed SDK signs up without a code challenge, restores persisted sessions and coordinates concurrent refreshes without a custom lock", async () => {
  const { createClient } = require("@supabase/supabase-js");
  const storage = new Map();
  const user = {
    id: "20000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    email: "listener@example.com",
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const requests = [];
  let refreshes = 0;
  const session = () => {
    const payload = {
      sub: user.id,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: String(refreshes),
    };
    return {
      access_token:
        [{ alg: "HS256", typ: "JWT" }, payload]
          .map((part) =>
            Buffer.from(JSON.stringify(part)).toString("base64url"),
          )
          .join(".") + ".signature",
      refresh_token: "refresh-" + refreshes,
      expires_in: 3600,
      token_type: "bearer",
      user,
    };
  };
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(init.body) : {};
    requests.push({ path: url.pathname, body });
    if (url.pathname === "/auth/v1/signup") return Response.json(session());
    if (
      url.pathname === "/auth/v1/token" &&
      url.searchParams.get("grant_type") === "refresh_token"
    ) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json(session());
    }
    throw Error("Unexpected auth request: " + url.pathname);
  };
  const filename = path.join(__dirname, "../src/services/authClient.ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  function boot() {
    const exports = {};
    const imports = {
      "react-native-url-polyfill/auto": {},
      "@supabase/supabase-js": { createClient },
      "@/config/content": {
        validateContentConfig: () => ({
          url: "https://test.supabase.co",
          key: "public-test-key",
          error: null,
        }),
      },
      "@/services/authStorage": {
        authStorage: {
          async getItem(key) {
            return storage.get(key) ?? null;
          },
          async setItem(key, value) {
            storage.set(key, value);
          },
          async removeItem(key) {
            storage.delete(key);
          },
        },
      },
      "@/utils/boundedFetch": { boundedFetch: (fetch) => fetch },
    };
    new vm.Script(source, { filename }).runInNewContext({
      exports,
      fetch: fetcher,
      process: { env: {} },
      require(name) {
        if (Object.hasOwn(imports, name)) return imports[name];
        throw Error("Unexpected import: " + name);
      },
    });
    return exports.getAuthClient();
  }
  const first = boot();
  let restored;
  try {
    const signup = await first.auth.signUp({
      email: user.email,
      password: "StrongPassword7",
    });
    assert.equal(signup.error, null);
    assert.equal(signup.data.session.user.id, user.id);
    assert.equal(
      requests[0].body.code_challenge,
      null,
      "Password-only signup must not invoke native WebCrypto/PKCE fallback",
    );
    assert.equal(requests[0].body.code_challenge_method, null);
    await first.auth.dispose();
    restored = boot();
    const restoredSession = await restored.auth.getSession();
    assert.equal(restoredSession.error, null);
    assert.equal(restoredSession.data.session.user.id, user.id);
    const refreshed = await Promise.all([
      restored.auth.refreshSession(),
      restored.auth.refreshSession(),
    ]);
    assert.ok(
      refreshed.every(
        (result) => !result.error && result.data.session.user.id === user.id,
      ),
    );
    assert.equal(
      refreshes,
      1,
      "SDK deduplicates overlapping session refreshes",
    );
    assert.equal(
      (await restored.auth.getSession()).data.session.refresh_token,
      "refresh-1",
    );
  } finally {
    await first.auth.dispose();
    await restored?.auth.dispose();
  }
});
