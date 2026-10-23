import { createR2Store } from "../_shared/r2.ts";
import { createMediaMaintenanceHandler } from "./handler.ts";

const account = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const store = createR2Store({
  endpoint:
    Deno.env.get("R2_ENDPOINT") ??
    `https://${account}.r2.cloudflarestorage.com`,
  bucket: Deno.env.get("R2_BUCKET_NAME") ?? "",
  baseUrl: Deno.env.get("R2_PUBLIC_BASE_URL") ?? "",
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") ?? "",
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "",
});
Deno.serve(
  createMediaMaintenanceHandler({
    secret: Deno.env.get("MEDIA_MAINTENANCE_SECRET") ?? "",
    publicUrl: store.publicUrl,
    put: store.put,
    list: store.list,
    retireLegacy: store.retireLegacy,
    fetch,
    hash: async (bytes) =>
      [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", bytes as BufferSource),
        ),
      ]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
  }),
);
