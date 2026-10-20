const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { randomUUID } = require("node:crypto");
const userA = "20000000-0000-4000-8000-000000000001";
const userB = "20000000-0000-4000-8000-000000000002";
const load = (file, imports, globals = {}) => {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  new vm.Script(code, { filename: file }).runInNewContext({
    exports,
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
    console,
    AbortController,
    ...globals,
  });
  return exports;
};
const fresh = (user_id) => ({
  version: 1,
  user_id,
  role: "user",
  profile: { display_name: "Listener", revision: 0 },
  settings: {
    notifications_enabled: false,
    reminder_scope: "favorites",
    reminder_lead_minutes: 5,
    revision: 0,
  },
  favorites: [],
});
function harness(options = {}) {
  const local =
    options.local ??
    new Map([
      ["aceradio:favorites:v1", JSON.stringify(["rush-hour"])],
      ["aceradio:push-enabled", "true"],
    ]);
  const server =
    options.server ??
    new Map([
      [userA, fresh(userA)],
      [userB, fresh(userB)],
    ]);
  const push =
    options.push ?? new Map([["guest", { consent: true, oneTime: [] }]]);
  const calls = { writes: [], storageWrites: 0 },
    slots = [],
    timers = new Map();
  let cursor = 0,
    dirty = false,
    effects = [],
    result,
    owner = options.owner ?? null,
    alive = true,
    timerId = 0;
  const storage = {
    getItem: async (key) => local.get(key) ?? null,
    async setItem(key, value) {
      calls.storageWrites++;
      if (options.storageFailure?.(key)) throw Error("Storage unavailable");
      local.set(key, value);
    },
    removeItem: async (key) => {
      local.delete(key);
    },
    getAllKeys: async () => [...local.keys()],
  };
  const api = {
    async read() {
      const current = owner;
      if (options.readWait) await options.readWait;
      return structuredClone(server.get(current));
    },
    async write(changes) {
      const current = owner;
      if (options.offline) throw Error("Offline");
      const account = server.get(current);
      calls.writes.push({ owner: current, changes });
      const results = changes.map((change) => {
        if (change.kind === "favorite") {
          let row = account.favorites.find(
            (row) => row.show_id === change.show_id,
          );
          if (!row)
            account.favorites.push(
              (row = {
                show_id: change.show_id,
                revision: 0,
                is_favorite: false,
              }),
            );
          row.is_favorite = change.value;
          row.revision++;
        } else if (change.kind === "settings")
          Object.assign(account.settings, {
            notifications_enabled: change.value,
            reminder_scope: change.scope ?? account.settings.reminder_scope,
            reminder_lead_minutes:
              change.leadMinutes ?? account.settings.reminder_lead_minutes,
            revision: account.settings.revision + 1,
          });
        return { id: change.id, status: "saved" };
      });
      return { account: structuredClone(account), results };
    },
  };
  const timing = {
    setTimeout: (fn, ms) => {
      timers.set(++timerId, { fn, ms });
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: () => 0,
    clearInterval() {},
  };
  const types = load("src/types/account.ts", { zod: require("zod") });
  const sync = load(
    "src/utils/AccountSync.ts",
    { zod: require("zod"), "@/types/account": types },
    timing,
  );
  const authClient = { accountConfig: { url: "https://test.supabase.co" } };
  const transfer = load("src/services/guestAccountTransfer.ts", {
    "@react-native-async-storage/async-storage": {
      __esModule: true,
      default: storage,
    },
    zod: require("zod"),
    "@/services/authClient": authClient,
  });
  const same = (a, b) =>
    a?.length === b.length && b.every((value, i) => Object.is(value, a[i]));
  const react = {
    createContext: () => ({ Provider: "Provider" }),
    useContext() {},
    useRef: (value) => (slots[cursor++] ??= { current: value }),
    useState(initial) {
      const i = cursor++;
      slots[i] ??= {
        value: typeof initial === "function" ? initial() : initial,
      };
      return [
        slots[i].value,
        (next) => {
          const value =
            typeof next === "function" ? next(slots[i].value) : next;
          if (!Object.is(value, slots[i].value)) {
            slots[i].value = value;
            dirty = true;
          }
        },
      ];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps))
        slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++,
        previous = slots[i];
      if (previous && same(previous.deps, deps)) return;
      const slot = (slots[i] = { deps });
      effects.push(() => {
        previous?.cleanup?.();
        slot.cleanup = fn();
      });
    },
    useSyncExternalStore(subscribe, snapshot) {
      react.useEffect(
        () =>
          subscribe(() => {
            dirty = true;
          }),
        [subscribe],
      );
      return snapshot();
    },
  };
  const { AccountDataProvider } = load(
    "src/context/AccountDataContext.tsx",
    {
      react,
      "react/jsx-runtime": { jsx: (type, props) => ({ type, props }) },
      "react-native": {
        AppState: {
          currentState: "active",
          addEventListener: () => ({ remove() {} }),
        },
        Platform: { OS: "android" },
      },
      "@react-native-async-storage/async-storage": {
        __esModule: true,
        default: storage,
      },
      "@react-native-community/netinfo": {
        __esModule: true,
        default: { addEventListener: () => () => {} },
      },
      "expo-crypto": { randomUUID },
      "@/context/AuthContext": {
        useAuth: () => ({
          session: owner ? { user: { id: owner } } : null,
          loading: false,
        }),
      },
      "@/services/authClient": authClient,
      "@/services/accountRepository": { accountApi: api },
      "@/utils/AccountSync": sync,
      "@/services/guestAccountTransfer": transfer,
      "@/services/pushNotifications": {
        readDevicePreferences: async (key) =>
          structuredClone(push.get(key) ?? { consent: false, oneTime: [] }),
        async saveDevicePreferences(key, value) {
          if (options.pushWait) await options.pushWait;
          push.set(key, value);
        },
      },
      "@/services/notifications": {
        getNotificationsEnabled: async () =>
          local.get("aceradio:push-enabled") === "true",
        enableNotifications: async () =>
          local.set("aceradio:push-enabled", "true"),
        disableNotifications: async () =>
          local.set("aceradio:push-enabled", "false"),
      },
    },
    timing,
  );
  function render() {
    if (!alive) return;
    let n = 0;
    do {
      assert.ok(++n < 20, "Render loop");
      cursor = 0;
      dirty = false;
      effects = [];
      const node = AccountDataProvider({ children: null });
      result = node.type(node.props);
      effects.forEach((fn) => fn());
    } while (dirty);
    return result.props.value;
  }
  async function flush() {
    for (let n = 0; n < 120; n++) {
      await Promise.resolve();
      render();
    }
    return result.props.value;
  }
  render();
  return {
    local,
    server,
    push,
    calls,
    options,
    render,
    flush,
    get value() {
      return result.props.value;
    },
    async owner(value) {
      owner = value;
      return flush();
    },
    async timer() {
      for (const [id, timer] of [...timers])
        if (timer.ms < 15000) {
          timers.delete(id);
          timer.fn();
        }
      return flush();
    },
    unmount() {
      alive = false;
      slots.forEach((slot) => slot.cleanup?.());
      timers.clear();
    },
  };
}

test("guests save favourites locally without an account and restore them on another launch", async () => {
  const h = harness();
  await h.flush();
  h.value.toggleFavorite("mornings");
  await h.flush();
  assert.deepEqual([...h.value.favorites], ["rush-hour", "mornings"]);
  const local = h.local;
  h.unmount();
  const restored = harness({ local });
  await restored.flush();
  assert.deepEqual([...restored.value.favorites], ["rush-hour", "mornings"]);
  assert.equal(restored.calls.writes.length, 0);
  restored.unmount();
});
test("signup automatically merges guest favourites, preserves the phone copy and carries explicit reminder consent", async () => {
  const h = harness();
  await h.flush();
  const transfer = h.value.transferGuestAfterSignup;
  await h.owner(userA);
  await transfer(userA);
  await h.flush();
  assert.deepEqual([...h.value.favorites], ["rush-hour"]);
  assert.equal(h.value.notificationsEnabled, true);
  assert.equal(h.value.guestImportAvailable, false);
  assert.equal(h.push.get(userA).consent, true);
  assert.deepEqual(JSON.parse(h.local.get("aceradio:favorites:v1")), [
    "rush-hour",
  ]);
  await h.timer();
  assert.equal(h.server.get(userA).favorites[0].show_id, "rush-hour");
  assert.equal(h.server.get(userA).favorites[0].is_favorite, true);
  assert.equal(h.server.get(userA).settings.notifications_enabled, true);
  assert.ok(
    ![...h.local.keys()].some((key) =>
      key.startsWith("aceradio:signup-transfer:"),
    ),
  );
  await h.owner(null);
  assert.deepEqual([...h.value.favorites], ["rush-hour"]);
  h.unmount();
});
test("existing-account sign-in and account switches never silently import another guest identity", async () => {
  const h = harness();
  await h.flush();
  await h.owner(userA);
  assert.equal(h.value.favorites.length, 0);
  assert.equal(h.value.guestImportAvailable, true);
  assert.equal(h.push.has(userA), false);
  await h.owner(userB);
  assert.equal(h.value.favorites.length, 0);
  assert.equal(h.server.get(userB).favorites.length, 0);
  assert.equal(h.push.has(userB), false);
  h.unmount();
});
test("an interrupted signup transfer resumes from its owner-scoped journal after restart", async () => {
  const h = harness();
  await h.flush();
  await h.value.transferGuestAfterSignup(userA);
  const { local, push, server } = h;
  h.unmount();
  const restored = harness({ owner: userA, local, push, server });
  await restored.flush();
  assert.deepEqual([...restored.value.favorites], ["rush-hour"]);
  await restored.timer();
  assert.equal(server.get(userA).favorites[0].is_favorite, true);
  assert.ok(
    ![...local.keys()].some((key) =>
      key.startsWith("aceradio:signup-transfer:"),
    ),
  );
  restored.unmount();
});
test("offline account writes retain imported favourites visibly and in the durable outbox until reconnect", async () => {
  const h = harness({ offline: true });
  await h.flush();
  await h.value.transferGuestAfterSignup(userA);
  await h.owner(userA);
  await h.timer();
  assert.deepEqual([...h.value.favorites], ["rush-hour"]);
  assert.ok(h.value.pending > 0);
  assert.ok([...h.local.keys()].some((key) => key.includes(":op:")));
  h.options.offline = false;
  h.unmount();
  const restored = harness({
    owner: userA,
    local: h.local,
    push: h.push,
    server: h.server,
  });
  await restored.flush();
  await restored.timer();
  assert.equal(h.server.get(userA).favorites[0].is_favorite, true);
  restored.unmount();
});
test("transfer storage failure preserves the journal and guest copy without a busy retry loop", async () => {
  const h = harness();
  await h.flush();
  await h.value.transferGuestAfterSignup(userA);
  h.options.storageFailure = (key) => key.includes(":account:");
  await h.owner(userA);
  const writes = h.calls.storageWrites;
  await h.flush();
  assert.equal(h.calls.storageWrites, writes);
  assert.ok(h.value.error);
  assert.ok(
    [...h.local.keys()].some((key) =>
      key.startsWith("aceradio:signup-transfer:"),
    ),
  );
  h.options.storageFailure = null;
  await h.value.refresh();
  await h.flush();
  await h.timer();
  assert.deepEqual([...h.value.favorites], ["rush-hour"]);
  assert.equal(h.value.error, null);
  h.unmount();
});
test("switching accounts during a signup transfer cannot copy favourites or consent to the next account", async () => {
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const h = harness({ pushWait: wait });
  await h.flush();
  await h.value.transferGuestAfterSignup(userA);
  await h.owner(userA);
  await h.owner(userB);
  release();
  await h.flush();
  await h.timer();
  assert.equal(h.value.favorites.length, 0);
  assert.equal(h.push.has(userB), false);
  assert.equal(h.server.get(userB).favorites.length, 0);
  h.unmount();
});
test("large guest collections queue in bounded batches without dropping the transfer or spinning at capacity", async () => {
  const ids = Array.from({ length: 240 }, (_, i) => `show-${i}`);
  const h = harness({
    local: new Map([["aceradio:favorites:v1", JSON.stringify(ids)]]),
  });
  await h.flush();
  await h.value.transferGuestAfterSignup(userA);
  await h.owner(userA);
  // Allow the sequential durable writes to finish without advancing network timers.
  let stable = 0;
  for (let n = 0; n < 40 && stable < 2; n++) {
    const before = h.calls.storageWrites;
    await h.flush();
    stable = before === h.calls.storageWrites ? stable + 1 : 0;
  }
  assert.equal(
    stable,
    2,
    "The local transfer must settle while the outbox is full",
  );
  assert.ok(h.value.pending <= 198);
  assert.equal(h.value.favorites.length, 240);
  const writes = h.calls.storageWrites;
  await h.flush();
  assert.equal(h.calls.storageWrites, writes);
  for (
    let n = 0;
    n < 80 && (h.server.get(userA).favorites.length < 240 || h.value.pending);
    n++
  ) {
    await h.timer();
    await h.flush();
  }
  assert.equal(h.server.get(userA).favorites.length, 240);
  assert.equal(h.value.canEdit, true);
  h.unmount();
});
