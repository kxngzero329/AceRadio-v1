import {
  compileSnapshot,
  parsePointer,
  sha256,
  type Pointer,
} from "../_shared/publicSnapshot.ts";

type Dependencies = {
  secret: string;
  claim(token: string): Promise<{
    allowed: boolean;
    revision?: number;
    next_transition?: string | null;
  }>;
  load(token: string): Promise<unknown>;
  readPointer(): Promise<{ value: Pointer; etag: string } | null>;
  putImmutable(key: string, bytes: Uint8Array, hash: string): Promise<void>;
  putPointer(pointer: Pointer, etag: string | null): Promise<void>;
  now?: () => number;
};
export function createContentPublishHandler(deps: Dependencies) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  return async (request: Request) => {
    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status, headers });
    if (request.method !== "POST")
      return reply(405, { error: "Method not allowed" });
    const token =
      request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? "";
    if (
      !deps.secret ||
      token.length !== 64 ||
      (await sha256(new TextEncoder().encode(token))) !==
        (await sha256(new TextEncoder().encode(deps.secret)))
    )
      return reply(401, { error: "Publisher credential required" });
    let stage = "claim";
    try {
      const lease = await deps.claim(token);
      if (!lease.allowed)
        return new Response(
          JSON.stringify({ error: "Publisher is already running" }),
          { status: 429, headers: { ...headers, "Retry-After": "55" } },
        );
      const now = (deps.now ?? Date.now)();
      stage = "pointer-read";
      const previous = await deps.readPointer();
      const unchanged =
        previous &&
        previous.value.revision === lease.revision &&
        (!previous.value.next_transition ||
          Date.parse(previous.value.next_transition) > now);
      let hash: string, revision: number;
      if (unchanged) {
        hash = previous.value.sha256;
        revision = previous.value.revision;
      } else {
        stage = "export";
        const source = await deps.load(token);
        revision = Number((source as { revision: number }).revision);
        if (!Number.isSafeInteger(revision) || revision < 1)
          throw Error("Invalid revision");
        const bytes = new TextEncoder().encode(
          JSON.stringify(compileSnapshot(source)),
        );
        if (bytes.byteLength > 1048576) throw Error("Public content too large");
        hash = await sha256(bytes);
        stage = "immutable-write";
        await deps.putImmutable(`public-content/v1/${hash}.json`, bytes, hash);
      }
      const pointer = parsePointer({
        version: 1,
        sha256: hash,
        path: `public-content/v1/${hash}.json`,
        revision,
        checked_at: new Date(now).toISOString(),
        next_transition:
          revision !== lease.revision
            ? new Date(now).toISOString()
            : (lease.next_transition ?? null),
      });
      stage = "pointer-write";
      await deps.putPointer(pointer, previous?.etag ?? null);
      return reply(200, {
        published: true,
        unchanged: !!unchanged,
        revision,
        sha256: hash,
      });
    } catch {
      return reply(503, {
        stage,
        error:
          "Public content could not be published; previous snapshot is retained",
      });
    }
  };
}
