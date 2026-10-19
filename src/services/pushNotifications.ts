import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { getRandomBytes, randomUUID } from "expo-crypto";
import Constants from "expo-constants";
import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import { accountConfig } from "@/services/authClient";
import type { DevicePreferences, OneTimeReminder, ReminderLead, ReminderScope } from "@/types/notifications";

export const pushEnvironment = process.env.EXPO_PUBLIC_PUSH_ENVIRONMENT === "production" ? "production" : "preview";
export const pushUnsupportedReason = () => Platform.OS === "web"
  ? "Show reminders are available in the Android and iPhone app."
  : isRunningInExpoGo() ? "Push reminders need an installed AceRadio build. Expo Go can still be used for listening." : null;
type Identity = { id: string; secret: string; sequence: number; token: string | null; tokenUpdatedAt?: number };
let identity: Identity | null = null;
let identityLoad: Promise<Identity | null> | null = null;
let write: Promise<unknown> = Promise.resolve();
// Preview/production upgrades can retain the same Expo token. Keep installation
// ownership stable while consent/audience stays explicitly environment-scoped.
const secureKey = `aceradio.push.${accountConfig.url.replace(/[^a-z0-9]/gi, "_")}`;
async function loadIdentity(create: boolean): Promise<Identity | null> {
  if (identity) return identity;
  identityLoad ??= SecureStore.getItemAsync(secureKey).then(raw => {
    if (!raw) return null;
    try {
      const item = JSON.parse(raw);
      if (/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(item.id) && /^[a-f0-9]{64}$/.test(item.secret) && Number.isSafeInteger(item.sequence) && item.sequence >= 0 &&
        (item.token === null || typeof item.token === "string")) return identity = item;
    } catch { /* Replace a malformed installation only after explicit opt-in. */ }
    return null;
  }).catch(() => { identityLoad = null; throw Error("Secure device storage is unavailable. Please try again."); });
  const existing = await identityLoad;
  if (identity) return identity;
  if (existing || !create) return existing;
  identity = { id: randomUUID(), secret: [...getRandomBytes(32)].map(n => n.toString(16).padStart(2, "0")).join(""), sequence: 0, token: null };
  await SecureStore.setItemAsync(secureKey, JSON.stringify(identity));
  return identity;
}
let api: Promise<typeof import("expo-notifications")> | null = null;
export function invalidatePushToken() { if (identity) identity.tokenUpdatedAt = 0; }
export function notificationApi() {
  if (pushUnsupportedReason()) return null;
  return api ??= import("expo-notifications");
}
export async function permissionGranted() {
  const notifications = await notificationApi();
  if (!notifications) return false;
  const permission = await notifications.getPermissionsAsync();
  return permission.granted || permission.ios?.status === notifications.IosAuthorizationStatus.PROVISIONAL;
}
export async function acquirePushToken() {
  const unsupported = pushUnsupportedReason();
  if (unsupported) throw Error(unsupported);
  const notifications = (await notificationApi())!;
  if (Platform.OS === "android") await notifications.setNotificationChannelAsync("ace-radio-updates", {
    name: "Show reminders", importance: notifications.AndroidImportance.DEFAULT, sound: "default",
  });
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain)
    permission = await notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  if (!permission.granted && permission.ios?.status !== notifications.IosAuthorizationStatus.PROVISIONAL)
    throw Error("Notifications are blocked on this phone. Enable them in your phone's notification settings.");
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw Error("This app build is missing its notification configuration.");
  const cached = await loadIdentity(false);
  if (cached?.token && cached.tokenUpdatedAt && Date.now() - cached.tokenUpdatedAt < 15 * 60_000) return cached.token;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error("Couldn't register notifications. Check your connection and try again.")), 15_000); }),
    ]);
    const persist = write.catch(() => {}).then(async () => {
      const current = await loadIdentity(true);
      current!.token = result.data;
      current!.tokenUpdatedAt = Date.now();
      await SecureStore.setItemAsync(secureKey, JSON.stringify(current));
    });
    write = persist;
    await persist;
    return result.data;
  } finally { if (timeout) clearTimeout(timeout); }
}
const preferenceKey = (owner: string) => `aceradio:push-consent:v1:${accountConfig.url}:${pushEnvironment}:${owner}`;
export async function readDevicePreferences(owner: string): Promise<DevicePreferences> {
  const raw = await AsyncStorage.getItem(preferenceKey(owner));
  try {
    const item = raw ? JSON.parse(raw) : {};
    return { consent: item.consent === true, oneTime: Array.isArray(item.oneTime) ? item.oneTime.filter((r: OneTimeReminder) =>
      r && typeof r.showId === "string" && /^[a-z0-9][a-z0-9-]{0,199}$/.test(r.showId) && typeof r.startsAt === "string" &&
      Date.parse(r.startsAt) > Date.now() && Date.parse(r.startsAt) < Date.now() + 14 * 86400_000 && [0, 5, 10, 15].includes(r.leadMinutes)).slice(0, 50) : [] };
  } catch { return { consent: false, oneTime: [] }; }
}
export const saveDevicePreferences = (owner: string, value: DevicePreferences) => AsyncStorage.setItem(preferenceKey(owner), JSON.stringify(value));
export type DeviceSnapshot = {
  enabled: boolean; preferences: { enabled: boolean; scope: ReminderScope; leadMinutes: ReminderLead };
  favorites: string[]; oneTime: OneTimeReminder[];
};
/** Serialize credentials/counters. Higher sequence numbers reject late older-owner requests. */
export function syncPushDevice(snapshot: DeviceSnapshot, bearer: string | undefined) {
  const operation = write.catch(() => {}).then(async () => {
    const current = await loadIdentity(false);
    if (!current) return { deliveryEnabled: false, saved: true };
    if (accountConfig.error) throw Error("Reminder service is not configured for this build.");
    current.sequence++;
    await SecureStore.setItemAsync(secureKey, JSON.stringify(current));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${accountConfig.url}/functions/v1/push-device`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", apikey: accountConfig.key, "x-installation-secret": current.secret,
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
        body: JSON.stringify({ ...snapshot, id: current.id, sequence: current.sequence, token: current.token, platform: Platform.OS, environment: pushEnvironment }),
      }).catch(() => { throw Error("Couldn't sync reminders. Your choices are saved on this phone; reconnect to finish."); });
      if (!response.ok) throw Error(response.status === 429 ? "Too many changes. Reminders will sync again shortly." : "Couldn't sync reminders. Your choices are saved on this phone; reconnect to finish.");
      const result = await response.json().catch(() => { throw Error("Unexpected reminder service response."); });
      if (result.saved !== true && result.saved !== false) throw Error("Unexpected reminder service response.");
      return { deliveryEnabled: result.deliveryEnabled === true, saved: result.saved };
    } finally { clearTimeout(timer); }
  });
  write = operation;
  return operation;
}
