type Loaded = { bytes: Uint8Array; hash: string };
export function createPublicContentHandler(
  load: () => Promise<Loaded>,
  now = Date.now,
  limit = 240,
) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "if-none-match,content-type",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Expose-Headers": "ETag,Retry-After",
    "Cache-Control": "public, max-age=60, must-revalidate",
  };
  // Bounded per-warm-instance safeguard, not a global IP quota. R2 supplies
  // every response; even a cache miss never queries Postgres.
  const clients = new Map<string, { start: number; count: number }>();
  return async (request: Request) => {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (!["GET", "HEAD"].includes(request.method))
      return new Response(null, {
        status: 405,
        headers: { ...headers, "Cache-Control": "no-store" },
      });
    const ip = (
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0] ??
      "unknown"
    ).slice(0, 100);
    let client = clients.get(ip);
    if (!client || now() - client.start >= 60000) {
      if (clients.size >= 4096) {
        for (const [key, entry] of clients)
          if (now() - entry.start >= 60000) clients.delete(key);
        if (clients.size >= 4096) clients.delete(clients.keys().next().value!);
      }
      client = { start: now(), count: 0 };
      clients.set(ip, client);
    }
    if (++client.count > limit)
      return new Response(null, {
        status: 429,
        headers: {
          ...headers,
          "Cache-Control": "no-store",
          "Retry-After": String(
            Math.max(1, Math.ceil((client.start + 60000 - now()) / 1000)),
          ),
        },
      });
    try {
      const loaded = await load(),
        etag = `"${loaded.hash}"`;
      const current = { ...headers, ETag: etag };
      if (request.headers.get("if-none-match")?.replace(/^W\//i, "") === etag)
        return new Response(null, { status: 304, headers: current });
      return new Response(
        request.method === "HEAD" ? null : (loaded.bytes as BodyInit),
        { headers: current },
      );
    } catch {
      return new Response(
        JSON.stringify({ error: "Station content is temporarily unavailable" }),
        {
          status: 503,
          headers: {
            ...headers,
            "Cache-Control": "no-store",
            "Retry-After": "30",
          },
        },
      );
    }
  };
}
