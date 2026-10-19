type Rpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type Dependencies = { rpc: Rpc; authorize(token: string): Promise<string | null>; hash(text: string): Promise<string>; rateSalt: string; deliveryEnabled: boolean | ((environment: string, id: string) => boolean) };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const id = /^[a-z0-9][a-z0-9-]{0,199}$/;
const token = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-installation-secret", "Access-Control-Allow-Methods": "POST,OPTIONS" };
export function createPushDeviceHandler(deps: Dependencies) {
  return async (request: Request) => {
    const reply = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
    try {
      // No raw IP, bearer token, push token or installation secret is logged.
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
      const bucket = await deps.hash(`${deps.rateSalt}:${ip}`);
      for (const [suffix, max, seconds] of [["minute", 300, 60], ["day", 10000, 86400]] as const) {
        const limit = await deps.rpc("push_hit_limit", { p_bucket: `${bucket}:${suffix}`, p_max: max, p_seconds: seconds });
        if (limit.error) return reply(503, { error: "Reminder service unavailable" });
        if (limit.data !== true) return new Response(JSON.stringify({ error: "Please wait before trying again" }), { status: 429, headers: { ...headers, "Retry-After": "60" } });
      }
      const secret = request.headers.get("x-installation-secret") ?? "";
      if (!/^[a-f0-9]{64}$/.test(secret)) return reply(401, { error: "Installation authentication required" });
      if (Number(request.headers.get("content-length") ?? 0) > 65536) return reply(413, { error: "Request too large" });
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 65536) return reply(413, { error: "Request too large" });
      let value;
      try { value = JSON.parse(raw); } catch { return reply(400, { error: "Invalid request" }); }
      const body = value as Record<string, unknown>;
      if (!body || typeof body !== "object" || !uuid.test(String(body.id)) || !Number.isSafeInteger(body.sequence) || Number(body.sequence) < 1 ||
        !["android", "ios"].includes(String(body.platform)) || !["preview", "production"].includes(String(body.environment)) ||
        typeof body.enabled !== "boolean" || (body.token !== null && (typeof body.token !== "string" || !token.test(body.token))) ||
        (body.enabled && !body.token)) return reply(400, { error: "Invalid device" });
      const deviceLimit = await deps.rpc("push_hit_limit", { p_bucket: `device:${body.id}`, p_max: 30, p_seconds: 60 });
      if (deviceLimit.error) return reply(503, { error: "Reminder service unavailable" });
      if (deviceLimit.data !== true) return reply(429, { error: "Please wait before changing reminders again" });
      const prefs = body.preferences as Record<string, unknown>;
      if (!prefs || typeof prefs.enabled !== "boolean" || !["favorites", "all"].includes(String(prefs.scope)) || ![0, 5, 10, 15].includes(Number(prefs.leadMinutes)) || typeof prefs.leadMinutes !== "number" ||
        !Array.isArray(body.favorites) || body.favorites.length > 2000 || !body.favorites.every(item => typeof item === "string" && id.test(item)) ||
        !Array.isArray(body.oneTime) || body.oneTime.length > 50 || !body.oneTime.every(item => item && typeof item.showId === "string" && id.test(item.showId) && typeof item.startsAt === "string" && Number.isFinite(Date.parse(item.startsAt)) && [0, 5, 10, 15].includes(item.leadMinutes))) {
        return reply(400, { error: "Invalid reminder choices" });
      }
      const bearer = request.headers.get("authorization");
      const user = bearer ? await deps.authorize(bearer.replace(/^Bearer\s+/i, "")) : null;
      if (bearer && !user) return reply(401, { error: "Please refresh your sign-in" });
      const result = await deps.rpc("push_register_device", {
        p_id: body.id, p_hash: await deps.hash(secret), p_sequence: body.sequence, p_token: body.token,
        p_platform: body.platform, p_environment: body.environment, p_user: user,
        p_enabled: body.enabled, p_preferences: prefs, p_favorites: [...new Set(body.favorites)], p_one_time: body.oneTime,
      });
      if (result.error) {
        const code = (result.error as { code?: string }).code;
        return reply(code === "42501" ? 403 : code === "23505" ? 409 : 503, { error: code === "23505" ? "This device needs to be registered again" : "Unable to save reminders" });
      }
      return reply(200, { ...(result.data as object), deliveryEnabled: typeof deps.deliveryEnabled === "function" ? deps.deliveryEnabled(String(body.environment), String(body.id)) : deps.deliveryEnabled });
    } catch { return reply(503, { error: "Reminder service unavailable" }); }
  };
}
