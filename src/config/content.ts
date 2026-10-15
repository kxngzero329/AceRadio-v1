/** Rollout is explicit. Linking the CLI or supplying keys never switches app content. */
export function validateContentConfig(source: string | undefined, url: string | undefined, key: string | undefined) {
  const selected = source === "supabase" ? "supabase" : "bundled";
  let error: string | null = null;
  let validKey = false;
  if (key?.startsWith("sb_publishable_")) validKey = true;
  else if (key?.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      validKey = payload.role === "anon";
    } catch { /* Invalid or privileged keys are rejected, never logged. */ }
  }
  if (selected === "supabase" && (!url || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(url) || !validKey)) {
    error = "Station content is unavailable. Please try again later.";
  }
  return { source: selected, url: url?.replace(/\/$/, "") ?? "", key: validKey ? key! : "", error } as const;
}

export const contentConfig = validateContentConfig(
  process.env.EXPO_PUBLIC_CONTENT_SOURCE,
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
