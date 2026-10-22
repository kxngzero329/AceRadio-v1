import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { createR2Store } from "../_shared/r2.ts";
import {
  POINTER_KEY,
  parsePointer,
  readBounded,
  type Pointer,
} from "../_shared/publicSnapshot.ts";
import { createContentPublishHandler } from "./handler.ts";

const config = {
  endpoint: Deno.env.get("R2_ENDPOINT")!,
  bucket: Deno.env.get("R2_BUCKET_NAME")!,
  baseUrl: Deno.env.get("R2_PUBLIC_BASE_URL")!,
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
};
const store = createR2Store(config);
const signer = new AwsClient({
  ...config,
  service: "s3",
  region: "auto",
  retries: 0,
});
const url = `${config.endpoint}/${config.bucket}/${POINTER_KEY}`;
const caller = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  },
);
async function rpc(name: string, token: string) {
  const result = await caller.rpc(name, { p_token: token });
  if (result.error) throw Error("Publication request failed");
  return result.data;
}
Deno.serve(
  createContentPublishHandler({
    secret: Deno.env.get("CONTENT_PUBLISH_SECRET") ?? "",
    claim: (token) => rpc("claim_public_content_publish", token),
    load: (token) => rpc("export_public_content", token),
    async readPointer() {
      const response = await fetch(
        await signer.sign(url, {
          method: "GET",
          headers: { "Accept-Encoding": "identity" },
        }),
        {
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        },
      );
      if (response.status === 404) return null;
      // R2 may gzip JSON GETs and mark their tags weak. Conditional PUT
      // must compare the original storage tag, not the compressed-response tag.
      const etag = response.headers.get("etag")?.replace(/^W\//i, "");
      if (!etag) throw Error("Missing pointer version");
      return {
        value: parsePointer(
          JSON.parse(new TextDecoder().decode(await readBounded(response))),
        ),
        etag,
      };
    },
    putImmutable: (key, bytes, hash) =>
      store.put(key, bytes, "application/json", hash),
    async putPointer(pointer: Pointer, etag: string | null) {
      const signed = await signer.sign(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30, must-revalidate",
          ...(etag ? { "If-Match": etag } : { "If-None-Match": "*" }),
        },
        body: JSON.stringify(pointer),
      });
      const response = await fetch(signed, {
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (!response.ok) throw Error("Pointer publication conflict");
    },
  }),
);
