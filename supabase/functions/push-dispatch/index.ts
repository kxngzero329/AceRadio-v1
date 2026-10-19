import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { createPushDispatchHandler } from "./handler.ts";
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
});
const allowed = Deno.env.get("PUSH_ALLOW_ALL") === "true" ? null :
  (Deno.env.get("PUSH_TEST_DEVICE_IDS") ?? "").split(",").map(value => value.trim()).filter(value => /^[a-f0-9-]{36}$/i.test(value));
Deno.serve(createPushDispatchHandler({
  rpc: async (name, args) => await admin.rpc(name, args), fetch,
  workerSecret: Deno.env.get("PUSH_WORKER_SECRET") ?? "",
  accessToken: Deno.env.get("EXPO_ACCESS_TOKEN") ?? "",
  enabled: Deno.env.get("PUSH_ENABLED") === "true",
  environment: Deno.env.get("PUSH_ENVIRONMENT") === "production" ? "production" : "preview", allowed,
}));
