import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { imageSize } from "npm:image-size@2.0.4";
import { createR2Store } from "../_shared/r2.ts";
import { createMediaUploadHandler, type MediaRecord } from "./handler.ts";
import { preserveLegacyImage } from "./compatibility.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_ANON_KEY")!;
const client = (token: string) =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
    },
  });
let store: ReturnType<typeof createR2Store> | null = null;
const hashBytes = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as BufferSource),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
try {
  const account = Deno.env.get("R2_ACCOUNT_ID") ?? "";
  if (Deno.env.get("R2_ACCESS_KEY_ID") && Deno.env.get("R2_SECRET_ACCESS_KEY"))
    store = createR2Store({
      endpoint:
        Deno.env.get("R2_ENDPOINT") ??
        `https://${account}.r2.cloudflarestorage.com`,
      bucket: Deno.env.get("R2_BUCKET_NAME") ?? "",
      baseUrl: Deno.env.get("R2_PUBLIC_BASE_URL") ?? "",
      accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
      secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
    });
} catch {
  /* Configuration failures must not reveal credential values in logs. */
}
Deno.serve(
  createMediaUploadHandler({
    configured: !!store,
    async authorize(token) {
      const caller = client(token);
      const user = await caller.auth.getUser(token);
      if (user.error || !user.data.user) return false;
      // The database owns role/MFA rules. No user_metadata role assertions and no
      // service-role key are needed for media writes.
      const result = await caller.rpc("is_content_editor");
      return !result.error && result.data === true;
    },
    async consumeQuota(token) {
      const result = await client(token).rpc("reserve_media_upload");
      if (result.error) throw Error("Upload quota check failed");
      return result.data === true;
    },
    inspect(bytes) {
      const image = imageSize(bytes);
      return {
        width: image.width,
        height: image.height,
        type: image.type ?? "",
      };
    },
    async hash(bytes) {
      return [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", bytes as BufferSource),
        ),
      ]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
    },
    put: (...args) => store!.put(...args),
    publicUrl: (key) => store!.publicUrl(key),
    async save(token, record: MediaRecord, bytes: Uint8Array) {
      const caller = client(token);
      const bucket = caller.storage.from(record.bucket_id);
      const publicUrl = bucket.getPublicUrl(record.object_path).data.publicUrl;
      await preserveLegacyImage(
        {
          upload: async () => {
            const uploaded = await bucket.upload(record.object_path, bytes, {
              contentType: record.mime_type,
              cacheControl: "31536000",
              upsert: false,
            });
            if (uploaded.error)
              throw Error("Legacy image copy needs verification");
          },
          read: () =>
            fetch(publicUrl, {
              redirect: "error",
              signal: AbortSignal.timeout(15000),
            }),
          hash: hashBytes,
        },
        record.sha256,
      );
      const result = await caller
        .from("media_assets")
        .upsert(record, { onConflict: "id", ignoreDuplicates: true });
      if (result.error) throw Error("Media registration failed");
      const saved = await caller
        .from("media_assets")
        .select("public_url,r2_sha256,r2_key,status")
        .eq("id", record.id)
        .single();
      if (
        saved.error ||
        saved.data.public_url !== record.public_url ||
        saved.data.r2_sha256 !== record.r2_sha256 ||
        saved.data.r2_key !== record.r2_key ||
        saved.data.status !== "published"
      )
        throw Error("Media registration conflict");
    },
  }),
);
