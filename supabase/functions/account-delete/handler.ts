type Failure = { code?: string } | null;
type Dependencies = {
  authorize(token: string): Promise<{ userId: string | null; error: Failure }>;
  check(token: string): Promise<{ allowed: boolean; error: Failure }>;
  remove(userId: string): Promise<{ error: Failure }>;
};
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Cache-Control": "no-store",
};
/** No caller-supplied target ID or service credentials ever enter the response. */
export function createAccountDeleteHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, error: string) =>
      Response.json({ error }, { status, headers });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, "Method not allowed.");
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer ([A-Za-z0-9._-]+)$/i)?.[1];
    if (!bearer || bearer.length > 8192)
      return reply(401, "Sign in to continue.");
    try {
      if (Number(request.headers.get("content-length") ?? "0") > 512)
        return reply(400, "Invalid request.");
      const reader = request.body?.getReader();
      if (!reader) return reply(400, "Confirmation required.");
      const decoder = new TextDecoder();
      let body = "",
        bytes = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 512) return reply(400, "Invalid request.");
          body += decoder.decode(part.value, { stream: true });
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const value = JSON.parse(body + decoder.decode());
      if (
        value?.confirm !== true ||
        Object.keys(value).some((key) => key !== "confirm")
      )
        return reply(400, "Confirmation required.");
      const identity = await dependencies.authorize(bearer);
      if (identity.error || !identity.userId)
        return reply(401, "Sign in again to continue.");
      const check = await dependencies.check(bearer);
      if (check.error?.code === "P0429")
        return reply(429, "Please try again later.");
      if (check.error || !check.allowed)
        return reply(
          403,
          "Recent password confirmation is required. Studio admins must transfer their role first.",
        );
      const deleted = await dependencies.remove(identity.userId);
      if (deleted.error)
        return reply(503, "Unable to delete the account. Please try again.");
      return Response.json({ deleted: true }, { headers });
    } catch {
      return reply(400, "Unable to complete this request.");
    }
  };
}
