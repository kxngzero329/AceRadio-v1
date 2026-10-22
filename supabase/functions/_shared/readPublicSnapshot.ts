import {
  POINTER_KEY,
  parsePointer,
  readBounded,
  sha256,
  type Pointer,
} from "./publicSnapshot.ts";
type Loaded = { bytes: Uint8Array; hash: string; pointer: Pointer };

/** Public catalogue reads use R2 only; this cache never contains user sessions. */
export function createSnapshotReader(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  now = Date.now,
) {
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw Error("Invalid public origin");
  const origin = baseUrl.replace(/\/+$/, "");
  let cached: Loaded | undefined,
    freshUntil = 0,
    retryAt = 0,
    pending: Promise<Loaded> | undefined;
  const request = (path: string) =>
    fetcher(`${origin}/${path}`, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  return async () => {
    if (cached && now() < freshUntil) return cached;
    if (now() < retryAt) throw Error("Public content is cooling down");
    if (!pending)
      pending = (async () => {
        try {
          const pointer = parsePointer(
            JSON.parse(
              new TextDecoder().decode(
                await readBounded(await request(POINTER_KEY)),
              ),
            ),
          );
          const checked = Date.parse(pointer.checked_at);
          if (now() - checked > 15 * 60000 || checked - now() > 5 * 60000)
            throw Error("Publisher heartbeat expired");
          let bytes: Uint8Array;
          if (cached?.hash === pointer.sha256) bytes = cached.bytes;
          else {
            bytes = await readBounded(await request(pointer.path));
            if ((await sha256(bytes)) !== pointer.sha256)
              throw Error("Public content verification failed");
          }
          cached = { bytes, hash: pointer.sha256, pointer };
          freshUntil = Math.min(now() + 60000, checked + 15 * 60000);
          retryAt = 0;
          return cached;
        } catch {
          retryAt = now() + 30000;
          throw Error("Public content unavailable");
        }
      })().finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
