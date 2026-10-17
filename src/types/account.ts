import { z } from "zod";

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const accountSchema = z.object({
  version: z.literal(1),
  user_id: z.uuid(),
  role: z.enum(["user", "admin"]),
  profile: z.object({ display_name: z.string().min(2).max(40), revision }),
  settings: z.object({ notifications_enabled: z.boolean(), revision }),
  favorites: z
    .array(
      z.object({
        show_id: z.string().min(1).max(200),
        is_favorite: z.boolean(),
        revision,
      }),
    )
    .max(2000),
});
export type Account = z.infer<typeof accountSchema>;
export const changeSchema = z
  .object({
    id: z.uuid(),
    base_revision: revision,
    created_at: z.number().finite(),
    sent: z.boolean().default(false),
  })
  .and(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("favorite"),
        show_id: z.string().min(1).max(200),
        value: z.boolean(),
      }),
      z.object({ kind: z.literal("settings"), value: z.boolean() }),
      z.object({
        kind: z.literal("profile"),
        value: z
          .string()
          .trim()
          .min(2)
          .max(40)
          .refine(
            (value) => !/[\u0000-\u001f\u007f-\u009f]/.test(value),
            "Display names cannot contain control characters.",
          ),
      }),
    ]),
  );
export type AccountChange = z.infer<typeof changeSchema>;
export type ChangeInput =
  | { kind: "favorite"; show_id: string; value: boolean }
  | { kind: "settings"; value: boolean }
  | { kind: "profile"; value: string };
export const syncResponseSchema = z.object({
  account: accountSchema,
  results: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(["saved", "conflict", "unavailable"]),
    }),
  ),
});
export type SyncResponse = z.infer<typeof syncResponseSchema>;
