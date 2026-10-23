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
    async list() {
      const keys: string[] = [];
      let continuation = "";
      const xmlText = (value: string) =>
        value
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '\"')
          .replace(/&apos;/g, "'");
      for (let page = 0; page < 100; page++) {
        const url = new URL(`${endpoint.origin}/${config.bucket}`);
        url.searchParams.set("list-type", "2");
        url.searchParams.set("encoding-type", "url");
        if (continuation)
          url.searchParams.set("continuation-token", continuation);
        const response = await fetch(await signer.sign(url.toString()), {
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
        if (!response.ok) throw Error("R2 inventory failed");
        const xml = await response.text();
        if (
          xml.length > 2097152 ||
          !xml.includes("<ListBucketResult") ||
          /<!DOCTYPE|<!ENTITY/i.test(xml)
        )
          throw Error("Invalid R2 inventory");
        for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g))
          keys.push(decodeURIComponent(xmlText(match[1])));
        const truncated = /<IsTruncated>(true|false)<\/IsTruncated>/.exec(
          xml,
        )?.[1];
        if (truncated === "false") return keys;
        const next =
          /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(
            xml,
          )?.[1];
        if (truncated !== "true" || !next || xmlText(next) === continuation)
          throw Error("Incomplete R2 inventory");
        continuation = xmlText(next);
      }
      throw Error("R2 inventory page limit exceeded");
    },
    async retireLegacy(source: string, target: string, sha: string) {
      if (
        !/^[a-f0-9]{64}$/.test(sha) ||
        !/^(show-artwork|presenter-photos|banners|station-media)\/r2\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(
          source,
        ) ||
        !/^(headshots|show-banners|events|announcements)\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(
          target,
        ) ||
        source.split("/").pop() !== target.split("/").pop() ||
        !target.split("/").pop()?.startsWith(`${sha}.`)
      )
        throw Error("Invalid legacy retirement");
      await verified(target, sha);
      const before = await request(source, "HEAD");
      if (before.status === 404) return { removed: false };
      if (!before.ok) throw Error("Legacy source unavailable");
      await verified(source, sha);
      const response = await request(source, "DELETE");
      if (![200, 204].includes(response.status))
        throw Error("Legacy retirement failed");
      let absent = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if ((await request(source, "HEAD")).status === 404) {
          absent = true;
          break;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * (attempt + 1)),
        );
      }
      if (!absent) throw Error("Legacy object still exists");
      return { removed: true };
    },
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
