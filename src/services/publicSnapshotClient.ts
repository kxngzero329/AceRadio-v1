export type PublicSnapshot = {
  version: 1;
  app: unknown;
  events: unknown[];
  website: unknown;
};
type Saved = {
  version: 1;
  body: string;
  hash: string;
  etag: string | null;
  fetchedAt: number;
  checkedAt?: string;
};
type Dependencies = {
  url: string;
  mode: "pointer" | "proxy";
  fetch: typeof fetch;
  hash(text: string): Promise<string>;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  now?: () => number;
};
const MAX_BYTES = 1048576;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const abortError = () =>
  Object.assign(new Error("Public content request cancelled"), {
    name: "AbortError",
  });
function checkHeartbeat(value: unknown, serverDate: string | null) {
  const checked = typeof value === "string" ? Date.parse(value) : NaN;
  const server = serverDate ? Date.parse(serverDate) : NaN;
  if (
    !Number.isFinite(checked) ||
    (Number.isFinite(server) &&
      (server - checked > 15 * 60000 || checked - server > 5 * 60000))
  )
    throw Error("Public content publisher is unavailable");
}
function snapshot(body: string): PublicSnapshot {
  if (body.length > MAX_BYTES) throw Error("Public content exceeds size limit");
  const value = JSON.parse(body);
  if (
    value?.version !== 1 ||
    !value.app ||
    typeof value.app !== "object" ||
    !Array.isArray(value.events) ||
    !value.website ||
    typeof value.website !== "object"
  )
    throw Error("Invalid public content snapshot");
  return value;
}
function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const aborted = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener("abort", aborted);
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
async function text(response: Response) {
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > MAX_BYTES
  )
    throw Error("Public content unavailable");
  // React Native's standard fetch may not expose a readable body stream.
  if (!response.body || typeof response.body.getReader !== "function") {
    const value = await response.text();
    if (value.length > MAX_BYTES)
      throw Error("Public content exceeds size limit");
    return value;
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let bytes = 0,
    body = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) throw Error("Public content exceeds size limit");
      body += decoder.decode(part.value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    void reader.cancel().catch(() => {});
  }
}

/** One request and one validated disk snapshot shared by catalogue/event queries.
 * Cancelling a screen never cancels a concurrent consumer's shared refresh. */
export function createPublicSnapshotClient(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  let saved: Saved | undefined, restored: Promise<void> | undefined;
  let pending: Promise<PublicSnapshot> | undefined;
  let retryAt = 0;
  const persist = () =>
    saved && deps.write(JSON.stringify(saved)).catch(() => {});
  const restore = () =>
    (restored ??= (async () => {
      try {
        const raw = await deps.read();
        if (!raw) return;
        const value = JSON.parse(raw) as Saved;
        if (
          value.version !== 1 ||
          typeof value.body !== "string" ||
          !Number.isFinite(value.fetchedAt) ||
          now() - value.fetchedAt > WEEK ||
          !/^[a-f0-9]{64}$/.test(value.hash) ||
          (await deps.hash(value.body)) !== value.hash
        )
          return;
        snapshot(value.body);
        saved = {
          ...value,
          etag:
            typeof value.etag === "string" && value.etag.length < 200
              ? value.etag
              : null,
          fetchedAt: value.fetchedAt <= now() ? value.fetchedAt : 0,
        };
      } catch {
        /* A damaged public cache cannot clear accounts or favourites. */
      }
    })());
  async function refresh(): Promise<PublicSnapshot> {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 15000);
    let backoff = 30000;
    try {
      const response = await deps.fetch(deps.url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(saved?.etag ? { "If-None-Match": saved.etag } : {}),
        },
      });
      if (response.status === 429 || response.status === 503) {
        const delay = Number(response.headers.get("retry-after"));
        if (Number.isFinite(delay) && delay > 0)
          backoff = Math.min(300000, Math.max(30000, delay * 1000));
      }
      if (response.status === 304) {
        if (!saved) throw Error("Public content cache is missing");
        if (deps.mode === "pointer")
          checkHeartbeat(saved.checkedAt, response.headers.get("date"));
        saved.fetchedAt = now();
        void persist();
        return snapshot(saved.body);
      }
      let body: string, hash: string, checkedAt: string | undefined;
      const etag = response.headers.get("etag");
      if (deps.mode === "pointer") {
        const pointer = JSON.parse(await text(response));
        if (
          pointer.version !== 1 ||
          !/^[a-f0-9]{64}$/.test(pointer.sha256) ||
          pointer.path !== `public-content/v1/${pointer.sha256}.json`
        )
          throw Error("Invalid public content pointer");
        checkHeartbeat(pointer.checked_at, response.headers.get("date"));
        checkedAt = pointer.checked_at;
        hash = pointer.sha256;
        if (saved?.hash === hash) body = saved.body;
        else {
          const url = new URL(`${hash}.json`, deps.url).href;
          body = await text(
            await deps.fetch(url, {
              signal: controller.signal,
              headers: { Accept: "application/json" },
            }),
          );
          if ((await deps.hash(body)) !== hash)
            throw Error("Public content verification failed");
        }
      } else {
        body = await text(response);
        hash = await deps.hash(body);
        if (etag && etag.replace(/^W\//i, "") !== `"${hash}"`)
          throw Error("Public content verification failed");
      }
      const value = snapshot(body);
      saved = { version: 1, body, hash, etag, fetchedAt: now(), checkedAt };
      retryAt = 0;
      void persist();
      return value;
    } catch {
      retryAt = now() + backoff;
      throw Error(
        "Station content could not be refreshed. Saved content remains available.",
      );
    } finally {
      clearTimeout(deadline);
    }
  }
  return {
    async get(signal: AbortSignal): Promise<PublicSnapshot> {
      await waitFor(restore(), signal);
      if (saved && now() - saved.fetchedAt < 60000) return snapshot(saved.body);
      if (now() < retryAt)
        throw Error(
          "Station content refresh is cooling down. Please retry shortly.",
        );
      if (!pending)
        pending = refresh().finally(() => {
          pending = undefined;
        });
      return waitFor(pending, signal);
    },
  };
}
