import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { accountConfig } from "@/services/authClient";

const lead = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(10),
  z.literal(15),
]);
const showId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,199}$/);
const schema = z.object({
  version: z.literal(1),
  favorites: z.array(showId).max(2000),
  remaining: z.array(showId).max(2000).optional(),
  notificationsEnabled: z.boolean(),
  scope: z.enum(["favorites", "all"]),
  leadMinutes: lead,
  push: z.object({
    consent: z.boolean(),
    oneTime: z
      .array(
        z.object({
          showId,
          startsAt: z.iso.datetime({ offset: true }),
          leadMinutes: lead,
        }),
      )
      .max(50),
  }),
});
export type GuestAccountTransfer = z.infer<typeof schema>;
const key = (userId: string) =>
  `aceradio:signup-transfer:v1:${accountConfig.url}:${z.uuid().parse(userId)}`;

export async function readGuestAccountTransfer(userId: string) {
  const raw = await AsyncStorage.getItem(key(userId));
  return raw ? schema.parse(JSON.parse(raw)) : null;
}
export const saveGuestAccountTransfer = (
  userId: string,
  transfer: GuestAccountTransfer,
) => AsyncStorage.setItem(key(userId), JSON.stringify(schema.parse(transfer)));
export const clearGuestAccountTransfer = (userId: string) =>
  AsyncStorage.removeItem(key(userId));
