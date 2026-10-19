import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { validateContentConfig } from "@/config/content";
import { authStorage } from "@/services/authStorage";
import type { Database } from "@/types/database";
import { boundedFetch } from "@/utils/boundedFetch";

// Authentication is available even when the catalogue source is bundled.
export const accountConfig = validateContentConfig(
  "supabase",
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
export const authStorageKey = `aceradio-auth-${accountConfig.url.replace(/[^a-z0-9]/gi, "-")}`;
let client: ReturnType<typeof createClient<Database>> | null = null;
export const accountFetch = boundedFetch(fetch);
export function getAuthClient() {
  if (accountConfig.error)
    throw Error("Accounts are unavailable. Please try again later.");
  client ??= createClient<Database>(accountConfig.url, accountConfig.key, {
    auth: {
      storage: authStorage,
      storageKey: authStorageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // Password-only auth needs no redirect/code challenge. Leave flowType at
      // the SDK default; add native S256 support before future redirect flows.
      // SDK 2.117 coordinates refreshes internally; custom locks are deprecated.
    },
    global: { fetch: accountFetch },
  });
  return client;
}
