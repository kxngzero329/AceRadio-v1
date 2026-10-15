import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { contentConfig } from "@/config/content";
import type { Database } from "@/types/database";

let client: SupabaseClient<Database> | null = null;
export function getSupabaseClient() {
  if (contentConfig.error || !contentConfig.url || !contentConfig.key) throw new Error("Content service is not configured.");
  client ??= createClient<Database>(contentConfig.url, contentConfig.key, {
    // Public catalogue reads need no listener account, persisted token, or auth refresh timer.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
