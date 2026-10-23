import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import type { MediaRecord } from "./handler.ts";

/** Persist references only. Image bytes have already been verified in R2. */
export async function registerMedia(
  caller: Pick<SupabaseClient, "from">,
  record: MediaRecord,
) {
  const result = await caller
    .from("media_assets")
    .upsert(record, { onConflict: "r2_key", ignoreDuplicates: true });
  if (result.error) throw Error("Media registration failed");
  const saved = await caller
    .from("media_assets")
    .select(
      "id,bucket_id,object_path,mime_type,width,height,sha256,status,public_url,r2_key,r2_sha256,r2_bytes",
    )
    .eq("r2_key", record.r2_key)
    .single();
  if (
    saved.error ||
    !saved.data ||
    saved.data.public_url !== record.public_url ||
    saved.data.r2_sha256 !== record.r2_sha256 ||
    saved.data.r2_bytes !== record.r2_bytes ||
    saved.data.r2_key !== record.r2_key ||
    saved.data.status !== "published"
  )
    throw Error("Media registration conflict");
  // Existing imported IDs remain authoritative when the same file is uploaded
  // again. Never replace their editorial metadata or create duplicate rows.
  return saved.data as MediaRecord;
}
