export type MediaRecord = {
  id: string;
  bucket_id: string;
  object_path: string;
  mime_type: string;
  width: number;
  height: number;
  sha256: string;
  status: string;
  public_url: string;
  r2_key: string;
  r2_sha256: string;
  r2_bytes: number;
};
type Dependencies = {
  configured: boolean;
  authorize(token: string): Promise<boolean>;
  consumeQuota?(token: string): Promise<boolean>;
  inspect(bytes: Uint8Array): { width: number; height: number; type: string };
  hash(bytes: Uint8Array): Promise<string>;
  put(
    key: string,
    bytes: Uint8Array,
    type: string,
    hash: string,
  ): Promise<void>;
  publicUrl(key: string): string;
  save(token: string, record: MediaRecord): Promise<MediaRecord>;
};
const MAX_BYTES = 10 * 1024 * 1024;
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,apikey,content-type,x-client-info,x-media-bucket",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
async function boundedBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
    throw Error("size");
  if (!request.body) throw Error("size");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0,
    timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const consume = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) throw Error("size");
        chunks.push(value);
      }
      if (!size) throw Error("size");
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return bytes;
    };
    return await Promise.race([
      consume(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Error("size")), 10000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    void reader.cancel().catch(() => {});
  }
}
export function createMediaUploadHandler(deps: Dependencies) {
  return async (request: Request) => {
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return reply(405, { error: "Method not allowed." });
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer ([^\s]+)$/)?.[1];
    if (!bearer)
      return reply(401, {
        error: "Sign in to the admin workspace before uploading.",
      });
    try {
      if (!(await deps.authorize(bearer)))
        return reply(403, {
          error:
            "Admin access with the required verification is needed to upload images.",
        });
    } catch {
      return reply(503, {
        error: "Could not verify admin access. Please try again.",
      });
    }
    if (!deps.configured)
      return reply(503, { error: "R2 image uploads are not configured yet." });
    const category = request.headers.get("x-media-bucket") ?? "";
    const legacyBuckets: Record<string, string> = {
      headshots: "show-artwork",
      "show-banners": "banners",
      events: "station-media",
      announcements: "station-media",
    };
    const bucket = Object.hasOwn(legacyBuckets, category)
      ? legacyBuckets[category]
      : undefined;
    if (
      !["headshots", "show-banners", "events", "announcements"].includes(
        category,
      ) ||
      !bucket
    )
      return reply(400, { error: "Invalid image category." });
    const type = request.headers.get("content-type")?.split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(type ?? ""))
      return reply(415, { error: "Choose a JPG, PNG or WebP image." });
    try {
      if (deps.consumeQuota && !(await deps.consumeQuota(bearer)))
        return new Response(
          JSON.stringify({
            error:
              "Upload limit reached. Please wait before trying again; existing images are safe.",
          }),
          { status: 429, headers: { ...headers, "Retry-After": "60" } },
        );
    } catch {
      return reply(503, {
        error: "Upload permission could not be checked. Please retry shortly.",
      });
    }
    let bytes: Uint8Array;
    try {
      bytes = await boundedBody(request);
    } catch {
      return reply(413, { error: "Upload an image between 1 byte and 10 MB." });
    }
    let image: { width: number; height: number; type: string };
    try {
      image = deps.inspect(bytes);
      if (
        !image.width ||
        !image.height ||
        image.width > 8192 ||
        image.height > 8192 ||
        image.width * image.height > 16777216 ||
        !["jpg", "png", "webp"].includes(image.type) ||
        `image/${image.type === "jpg" ? "jpeg" : image.type}` !== type
      )
        throw Error("image");
    } catch {
      return reply(415, {
        error:
          "The file must be a valid JPG, PNG or WebP image within the supported dimensions.",
      });
    }
    try {
      const sha = await deps.hash(bytes);
      const filename = `${sha}.${image.type === "jpg" ? "jpg" : image.type}`;
      const key = `${category}/${filename}`;
      const objectPath = `r2/${key}`;
      // Content addressing makes retries idempotent. Never accept an object path
      // or public URL supplied by a browser, and never delete an uncertain upload.
      await deps.put(key, bytes, type!, sha);
      const record: MediaRecord = {
        id: `r2:${category}:${sha}`,
        bucket_id: bucket,
        object_path: objectPath,
        mime_type: type!,
        width: image.width,
        height: image.height,
        sha256: sha,
        status: "published",
        public_url: deps.publicUrl(key),
        r2_key: key,
        r2_sha256: sha,
        r2_bytes: bytes.byteLength,
      };
      const saved = await deps.save(bearer, record);
      return reply(200, { media: saved });
    } catch {
      return reply(502, {
        error:
          "The image could not be saved. Please retry; no existing images were removed.",
      });
    }
  };
}
