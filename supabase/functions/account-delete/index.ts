import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { createAccountDeleteHandler } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_ANON_KEY")!;
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  },
};
const admin = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  options,
);
const client = (token: string) =>
  createClient(url, key, {
    ...options,
    global: {
      ...options.global,
      headers: { Authorization: `Bearer ${token}` },
    },
  });
Deno.serve(
  createAccountDeleteHandler({
    async authorize(token) {
      const { data, error } = await client(token).auth.getUser(token);
      return { userId: data.user?.id ?? null, error };
    },
    async check(token) {
      const { data, error } = await client(token).rpc(
        "assert_account_deletion_allowed",
      );
      return { allowed: data === true, error };
    },
    async remove(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      return { error };
    },
  }),
);
