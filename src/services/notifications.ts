import AsyncStorage from "@react-native-async-storage/async-storage";

const PREF_KEY = "aceradio:push-enabled";

/** Local preview preference only; no permissions, push tokens or remote registration. */
export async function getNotificationsEnabled() {
  return (await AsyncStorage.getItem(PREF_KEY)) === "true";
}

export async function disableNotifications() {
  await AsyncStorage.setItem(PREF_KEY, "false");
}

export async function enableNotifications(): Promise<void> {
  await AsyncStorage.setItem(PREF_KEY, "true");
}
