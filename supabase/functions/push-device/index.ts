import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { createPushDeviceHandler } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
} });
Deno.serve(createPushDeviceHandler({
  rpc: async (name, args) => await admin.rpc(name, args),
  async authorize(token) { const { data, error } = await admin.auth.getUser(token); return error ? null : data.user?.id ?? null; },
  async hash(text) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map(n => n.toString(16).padStart(2, "0")).join(""); },
  rateSalt: key,
  deliveryEnabled: (environment, id) => Deno.env.get("PUSH_ENABLED") === "true" && !!Deno.env.get("EXPO_ACCESS_TOKEN") &&
    environment === (Deno.env.get("PUSH_ENVIRONMENT") === "production" ? "production" : "preview") &&
    (Deno.env.get("PUSH_ALLOW_ALL") === "true" || (Deno.env.get("PUSH_TEST_DEVICE_IDS") ?? "").split(",").map(value => value.trim()).includes(id)),
}));
