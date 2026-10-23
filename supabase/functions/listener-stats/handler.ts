// Read-only aggregate statistics for the exact mount played by the app.
// No database, credentials, listener identities or audio connections are used.
import { ICECAST_STATS_URL, ICECAST_STREAM_URL, parseMountListeners, readIcecastJson } from "../_shared/icecast.ts";
export { parseMountListeners } from "../_shared/icecast.ts";
export const STREAM_URL = ICECAST_STREAM_URL;
export const STATS_URL = ICECAST_STATS_URL;
export const CACHE_MS = 10_000;
const TIMEOUT_MS = 5_000;
const FAILURE_BACKOFF_MS = 5_000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Cache-Control": "no-store",
};


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
      const sample = { listeners: parseMountListeners(await readIcecastJson(response)), sampledAt: startedAt - Number(age) * 1000 };
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
