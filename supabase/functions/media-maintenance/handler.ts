export function createMediaMaintenanceHandler(deps: {
  secret: string;
  list?(): Promise<string[]>;
  retireLegacy?(
    source: string,
    target: string,
    sha: string,
  ): Promise<{ removed: boolean }>;
  publicUrl(key: string): string;
  put(key: string, bytes: Uint8Array, mime: string, sha: string): Promise<void>;
  hash(bytes: Uint8Array): Promise<string>;
  fetch: typeof fetch;
}) {
  return async (request: Request) => {
    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), {
        status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    if (request.method !== "POST")
      return reply(405, { error: "Method not allowed" });
    if (
      !deps.secret ||
      request.headers.get("authorization") !== `Bearer ${deps.secret}`
    )
      return reply(401, { error: "Private maintenance access required" });
    try {
      if (Number(request.headers.get("content-length")) > 12000)
        return reply(400, { error: "Invalid maintenance request" });
      const body = await request.text();
      if (body.length > 12000)
        return reply(400, { error: "Invalid maintenance request" });
      const plan = JSON.parse(body);
      if (plan.operation === "inventory") {
        if (!deps.list) throw Error("Inventory unavailable");
        return reply(200, { keys: await deps.list() });
      }
      if (plan.operation && !["copy", "retire"].includes(plan.operation))
        return reply(400, { error: "Invalid operation" });
      const extension = plan.key?.split(".").pop();
      if (
        !/^[a-f0-9]{64}$/.test(plan.sha256) ||
        !Number.isSafeInteger(plan.bytes) ||
        plan.bytes < 1 ||
        plan.bytes > 10485760 ||
        !/^(headshots|show-banners|events|announcements)\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(
          plan.key,
        ) ||
        !plan.key.endsWith(`/${plan.sha256}.${extension}`) ||
        !/^(show-artwork|presenter-photos|banners|station-media)\/r2\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(
          plan.sourceKey,
        ) ||
        !plan.sourceKey.endsWith(`/${plan.sha256}.${extension}`) ||
        plan.mimeType !== `image/${extension === "jpg" ? "jpeg" : extension}`
      )
        return reply(400, { error: "Invalid immutable copy plan" });
      if (plan.operation === "retire") {
        if (!deps.retireLegacy) throw Error("Retirement unavailable");
        const result = await deps.retireLegacy(
          plan.sourceKey,
          plan.key,
          plan.sha256,
        );
        return reply(200, { key: plan.sourceKey, ...result });
      }
      const response = await deps.fetch(deps.publicUrl(plan.sourceKey), {
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get("content-length")) > 10485760
      )
        throw Error("Source unavailable");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > plan.bytes) throw Error("Source changed");
          chunks.push(value);
        }
      } finally {
        void reader.cancel().catch(() => {});
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (size !== plan.bytes || (await deps.hash(bytes)) !== plan.sha256)
        throw Error("Source changed");
      await deps.put(plan.key, bytes, plan.mimeType, plan.sha256);
      return reply(200, { key: plan.key, sha256: plan.sha256, bytes: size });
    } catch (error) {
      const codes: Record<string, string> = {
        "R2 verification failed": "image_verification_failed",
        "Legacy source unavailable": "legacy_source_unavailable",
        "Legacy retirement failed": "delete_failed",
        "Legacy object still exists": "post_delete_check_failed",
        "Incomplete R2 inventory": "inventory_incomplete",
      };
      return reply(502, {
        error: "Maintenance failed; inspect inventory before retrying",
        code:
          error instanceof Error
            ? (codes[error.message] ?? "maintenance_unavailable")
            : "maintenance_unavailable",
      });
    }
  };
}
