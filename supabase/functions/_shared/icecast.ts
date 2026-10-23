// Pure Icecast decoding shared by the mobile app and aggregate Edge reader.
// No credentials, database access, platform-specific APIs or network requests.
export const ICECAST_STATS_URL = "https://studio.ace.radio/status-json.xsl";
export const ICECAST_STREAM_URL = "https://studio.ace.radio/stream";
const MAX_BODY_BYTES = 64 * 1024;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseMountListeners(value: unknown): number {
  const source = object(object(value)?.icestats)?.source;
  const sources = Array.isArray(source) ? source : source ? [source] : [];
  const matching = sources.map(object).filter((item) => {
    if (typeof item?.listenurl !== "string") return false;
    try {
      const url = new URL(item.listenurl);
      // Icecast advertises the internal arc.radio name, not the public alias.
      return (
        ["http:", "https:"].includes(url.protocol) &&
        ["studio.ace.radio", "studio.arc.radio"].includes(url.hostname) &&
        url.pathname === "/stream"
      );
    } catch {
      return false;
    }
  });
  // Never guess, sum different mounts, or turn a missing stream into zero.
  if (matching.length !== 1) throw new Error("Stream statistics unavailable.");
  const raw = matching[0]!.listeners;
  const count =
    typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("Invalid listener statistics.");
  }
  return count;
}

export async function readIcecastJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES)
    throw new Error("Statistics response too large.");
  // React Native fetch does not always expose a readable response stream.
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
      throw new Error("Statistics response too large.");
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES)
        throw new Error("Statistics response too large.");
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
  }
}
