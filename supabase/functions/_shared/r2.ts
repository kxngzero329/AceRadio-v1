import { AwsClient } from "npm:aws4fetch@1.0.20";

export function createR2Store(config: {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  baseUrl: string;
}) {
  const endpoint = new URL(config.endpoint);
  const base = new URL(config.baseUrl);
  if (
    endpoint.protocol !== "https:" ||
    !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname) ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.username ||
    endpoint.password ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) ||
    base.protocol !== "https:" ||
    base.search ||
    base.hash ||
    base.username ||
    base.password ||
    base.hostname.endsWith(".r2.cloudflarestorage.com")
  )
    throw Error("Invalid R2 configuration");
  const signer = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: "auto",
    retries: 0,
  });
  const encode = (key: string) => {
    if (
      !key ||
      key.startsWith("/") ||
      key.split("/").some((part) => !part || part === "." || part === "..") ||
      /[\s\\]/.test(key)
    )
      throw Error("Invalid media key");
    return key.split("/").map(encodeURIComponent).join("/");
  };
  const objectUrl = (key: string) =>
    `${endpoint.origin}/${config.bucket}/${encode(key)}`;
  const request = async (
    key: string,
    method: string,
    headers: Record<string, string> = {},
    body?: Uint8Array,
  ) => {
    const signed = await signer.sign(objectUrl(key), {
      method,
      headers,
      body: body as BodyInit | undefined,
    });
    return fetch(signed, {
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  };
  const hash = async (bytes: Uint8Array) =>
    [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes as BufferSource),
      ),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  const verified = async (key: string, sha: string) => {
    const urls = [
      await request(key, "GET"),
      await fetch(`${config.baseUrl.replace(/\/+$/, "")}/${encode(key)}`, {
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      }),
    ];
    for (const response of urls) {
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get("content-length")) > 10485760
      )
        throw Error("R2 verification failed");
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 10485760) throw Error("R2 verification size exceeded");
          chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        if ((await hash(bytes)) !== sha) throw Error("R2 verification failed");
      } finally {
        void reader.cancel().catch(() => {});
      }
    }
  };
  return {
    publicUrl: (key: string) =>
      `${config.baseUrl.replace(/\/+$/, "")}/${encode(key)}`,
    async put(key: string, bytes: Uint8Array, type: string, sha: string) {
      if ((await hash(bytes)) !== sha) throw Error("Invalid image hash");
      const response = await request(
        key,
        "PUT",
        {
          "Content-Type": type,
          "Cache-Control": "public, max-age=31536000, immutable",
          "x-amz-meta-sha256": sha,
          "If-None-Match": "*",
        },
        bytes,
      );
      if (![200, 201, 412].includes(response.status))
        throw Error("R2 upload failed");
      // A pre-existing content-addressed object is reused only after its actual
      // bytes match. Never overwrite a conflicting object or trust its metadata.
      await verified(key, sha);
    },
  };
}
