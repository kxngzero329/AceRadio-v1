import { z } from "zod";
import { STATION } from "@/config/station";
import {
  ICECAST_STATS_URL,
  parseMountListeners,
  readIcecastJson,
} from "../../supabase/functions/_shared/icecast";

export const LISTENER_REFRESH_MS = 10_000;
export const MAX_LISTENER_AGE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;
const payloadSchema = z.object({
  version: z.literal(1),
  stream_url: z.literal(STATION.streamUrl),
  listeners: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sampled_at: z.iso.datetime({ offset: true }),
  sample_age_ms: z.number().int().nonnegative().max(MAX_LISTENER_AGE_MS),
});

// Read the existing public API directly, independently of Supabase configuration.
// The Edge aggregate endpoint remains available to older builds/admin history.
export const listenerStatsUrl = ICECAST_STATS_URL;
export const listenerQueryKey = [
  "listener-stats",
  2,
  listenerStatsUrl,
  STATION.streamUrl,
] as const;
export type ListenerSample = {
  listeners: number;
  sampledAt: string;
  requestedAt: number;
  expiresAt: number;
};

export function decodeListenerSample(
  value: unknown,
  requestedAt: number,
  receivedAt: number,
): ListenerSample {
  const data = payloadSchema.parse(value);
  // Use the server's sample age, not a comparison between phone/server clocks.
  // Count the entire request duration as age too, conservatively including latency.
  const expiresAt = requestedAt + MAX_LISTENER_AGE_MS - data.sample_age_ms;
  if (receivedAt < requestedAt || receivedAt >= expiresAt)
    throw new Error("Listener sample expired.");
  return {
    listeners: data.listeners,
    sampledAt: data.sampled_at,
    requestedAt,
    expiresAt,
  };
}

export function freshListenerCount(
  sample: ListenerSample | undefined,
  now = Date.now(),
): number | null {
  return sample && now >= sample.requestedAt && now < sample.expiresAt
    ? sample.listeners
    : null;
}

export async function fetchListenerSample(
  signal: AbortSignal,
): Promise<ListenerSample> {
  if (!listenerStatsUrl) throw new Error("Listener statistics unavailable.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);
  const requestedAt = Date.now();
  try {
    const response = await fetch(listenerStatsUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw new Error("Listener statistics unavailable.");
    const age = response.headers.get("age") ?? "0";
    if (!/^\d+$/.test(age) || !Number.isSafeInteger(Number(age)))
      throw new Error("Invalid listener statistics age.");
    const sampleAge = Number(age) * 1000;
    const listeners = parseMountListeners(await readIcecastJson(response));
    return decodeListenerSample(
      {
        version: 1,
        stream_url: STATION.streamUrl,
        listeners,
        sampled_at: new Date(requestedAt - sampleAge).toISOString(),
        sample_age_ms: sampleAge,
      },
      requestedAt,
      Date.now(),
    );
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
