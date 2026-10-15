// Read-only aggregate statistics for the exact mount played by the app.
// No database, credentials, listener identities or audio connections are used.
export const STREAM_URL = "https://studio.ace.radio/stream";
export const STATS_URL = "https://studio.ace.radio/status-json.xsl";
export const CACHE_MS = 10_000;
const TIMEOUT_MS = 5_000;
const FAILURE_BACKOFF_MS = 5_000;
const MAX_BODY_BYTES = 64 * 1024;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Cache-Control": "no-store",
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parseMountListeners(value: unknown): number {
  const source = object(object(value)?.icestats)?.source;
  const sources = Array.isArray(source) ? source : source ? [source] : [];
  const matching = sources.map(object).filter(item => {
    if (typeof item?.listenurl !== "string") return false;
    try {
      const url = new URL(item.listenurl);
      // Icecast advertises the internal arc.radio name, not the public alias.
      return ["http:", "https:"].includes(url.protocol) &&
        ["studio.ace.radio", "studio.arc.radio"].includes(url.hostname) &&
        url.pathname === "/stream";
    } catch { return false; }
  });
  // Never guess, sum different mounts, or turn a missing stream into zero.
  if (matching.length !== 1) throw new Error("Stream statistics unavailable.");
  const raw = matching[0]!.listeners;
  const count = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid listener statistics.");
  }
  return count;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing statistics.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error("Statistics response too large.");
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); }
}

type Sample = { listeners: number; sampledAt: number };
export function createListenerStatsHandler(options: { fetch?: typeof fetch; now?: () => number } = {}) {
  const upstreamFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  // Opportunistic cache/single-flight per warm worker, never a durable counter.
  let cached: Sample | null = null;
  let inFlight: Promise<Sample> | null = null;
  let retryAt = 0;
  async function load(): Promise<Sample> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startedAt = now();
    try {
      const response = await upstreamFetch(STATS_URL, {
        signal: controller.signal, redirect: "error",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        await response.body?.cancel();
        throw new Error("Statistics unavailable.");
      }
      const age = response.headers.get("age") ?? "0";
      if (!/^\d+$/.test(age) || !Number.isSafeInteger(Number(age))) throw new Error("Invalid statistics age.");
      const sample = { listeners: parseMountListeners(await readJson(response)), sampledAt: startedAt - Number(age) * 1000 };
      if (now() - sample.sampledAt >= CACHE_MS || now() < sample.sampledAt) throw new Error("Stale statistics.");
      cached = sample;
      return sample;
    } finally { clearTimeout(timeout); }
  }
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...cors, Allow: "GET, OPTIONS" } });
    try {
      let sample = cached;
      if (!sample || now() < sample.sampledAt || now() - sample.sampledAt >= CACHE_MS) {
        if (now() < retryAt) throw new Error("Statistics unavailable.");
        inFlight ??= load().catch(error => {
          cached = null;
          retryAt = now() + FAILURE_BACKOFF_MS;
          throw error;
        }).finally(() => { inFlight = null; });
        sample = await inFlight;
      }
      return Response.json({ version: 1, stream_url: STREAM_URL, listeners: sample.listeners,
        sampled_at: new Date(sample.sampledAt).toISOString(), sample_age_ms: Math.max(0, now() - sample.sampledAt),
      }, { headers: cors });
    } catch {
      return Response.json({ error: "Listener statistics temporarily unavailable." }, {
        status: 503, headers: { ...cors, "Retry-After": "5" },
      });
    }
  };
}
