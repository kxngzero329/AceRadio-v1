import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { AppState, Linking } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePathname, useRootNavigationState } from "expo-router";
import { useAccountData } from "@/context/AccountDataContext";
import { useAuth } from "@/context/AuthContext";
import { useContent } from "@/context/ContentContext";
import { useRadio } from "@/context/RadioContext";
import { router } from "@/utils/navigation";
import { notificationOpenAction } from "@/utils/notificationOpen";
import { parseShowReminder, reminderKey, type DevicePreferences, type OneTimeReminder, type ShowReminder } from "@/types/notifications";
import { acquirePushToken, invalidatePushToken, notificationApi, permissionGranted, pushUnsupportedReason, readDevicePreferences, saveDevicePreferences, subscribeDevicePreferences, syncPushDevice } from "@/services/pushNotifications";

type PushState = {
  enabled: boolean; ready: boolean; busy: boolean; syncing: boolean; status: string;
  blocked: boolean; unsupported: boolean; deliveryActive: boolean; notice: string | null;
  oneTime: OneTimeReminder[];
  setEnabled(value: boolean): Promise<void>;
  setOneTime(showId: string, startsAt: string, enabled: boolean): Promise<void>;
  refresh(): void; openSettings(): Promise<void>; dismissNotice(): void;
};
const Context = createContext<PushState | null>(null);
const OPENED_KEY = "aceradio:push-opened:v1";
const disabledSnapshot = { enabled: false, preferences: { enabled: false, scope: "favorites" as const, leadMinutes: 5 as const }, favorites: [], oneTime: [] };

export function PushNotificationProvider({ children, startupReady }: PropsWithChildren<{ startupReady: boolean }>) {
  const account = useAccountData();
  const { session, loading: authLoading } = useAuth();
  const content = useContent();
  const radio = useRadio();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const owner = session?.user.id ?? "guest";
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const [local, setLocal] = useState<{ owner: string; ready: boolean; value: DevicePreferences }>({ owner, ready: false, value: { consent: false, oneTime: [] } });
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [deliveryReady, setDeliveryReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<{ id: string; reminder: ShowReminder; refreshed: boolean } | null>(null);
  const [opening, setOpening] = useState<{ path: string; play: boolean; preferredShow?: string } | null>(null);
  const action = useRef(0);
  const acting = useRef(false);
  const needsRetry = useRef(false);
  const previousOwner = useRef(owner);
  const latest = useRef({ content, radio });
  latest.current = { content, radio };
  const refresh = useCallback(() => setAttempt(value => value + 1), []);
  const ready = local.owner === owner && local.ready && account.ready && !account.transferringGuest;
  const preferences = local.owner === owner ? local.value : { consent: false, oneTime: [] };

  useEffect(() => {
    let current = true;
    action.current++;
    acting.current = false;
    setBusy(false);
    setSyncError(null);
    setDeliveryReady(false);
    if (previousOwner.current !== owner && !pushUnsupportedReason()) {
      // Release the old account association before the new owner's snapshot.
      void syncPushDevice(disabledSnapshot, undefined, () => ownerRef.current === owner).catch(() => {});
    }
    previousOwner.current = owner;
    let generation = 0;
    const restore = () => {
      const read = ++generation;
      void readDevicePreferences(owner).then(value => {
        if (current && read === generation) setLocal({ owner, ready: true, value });
      }).catch(() => {
        if (current && read === generation) {
          setLocal({ owner, ready: true, value: { consent: false, oneTime: [] } });
          setSyncError("Couldn't read reminders saved on this phone.");
        }
      });
    };
    const unsubscribe = subscribeDevicePreferences(changed => { if (changed === owner) restore(); });
    restore();
    return () => { current = false; action.current++; unsubscribe(); };
  }, [owner]);

  useEffect(() => {
    if (pushUnsupportedReason()) return;
    const app = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    const network = NetInfo.addEventListener(state => { if (state.isConnected && state.isInternetReachable !== false) refresh(); });
    const interval = setInterval(() => { if (needsRetry.current && AppState.currentState === "active") refresh(); }, 60_000);
    return () => { app.remove(); network(); clearInterval(interval); };
  }, [refresh]);

  const snapshot = useMemo(() => ({
    enabled: preferences.consent,
    preferences: { enabled: account.notificationsEnabled, scope: account.reminderScope, leadMinutes: account.reminderLeadMinutes },
    favorites: account.favorites,
    oneTime: preferences.oneTime,
  }), [preferences.consent, preferences.oneTime, account.notificationsEnabled, account.reminderScope, account.reminderLeadMinutes, account.favorites]);
  const signature = JSON.stringify(snapshot);
  const bearer = session?.access_token;
  useEffect(() => {
    if (!ready || authLoading || pushUnsupportedReason()) return;
    let current = true;
    const isCurrent = () => current && ownerRef.current === owner;
    setSyncing(true);
    const timeout = setTimeout(() => {
      void (async () => {
        setSyncing(true);
        try {
          const allowed = await permissionGranted();
          if (!isCurrent()) return;
          setGranted(allowed);
          // Refresh the Expo token after upgrades/reinstalls and on foreground.
          // This never prompts: permission was checked immediately above.
          if (snapshot.enabled && allowed) await acquirePushToken({ requestPermission: false });
          if (!isCurrent()) return;
          const result = await syncPushDevice({ ...snapshot, enabled: snapshot.enabled && allowed }, bearer, isCurrent);
          if (isCurrent()) { needsRetry.current = false; setDeliveryReady(result.deliveryEnabled); setSyncError(null); }
        } catch (error) {
          if (isCurrent()) { needsRetry.current = true; setSyncError(error instanceof Error ? error.message : "Couldn't sync reminders. Reconnect and try again."); }
        } finally { if (isCurrent()) setSyncing(false); }
      })();
    }, snapshot.enabled ? 900 : 0);
    return () => { current = false; clearTimeout(timeout); };
    // Snapshot is represented by its stable value, avoiding duplicate requests
    // when a content refresh creates an equivalent favourites array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, bearer, owner, ready, authLoading, attempt]);

  const save = async (value: DevicePreferences, expectedOwner: string) => {
    await saveDevicePreferences(expectedOwner, value);
    if (ownerRef.current === expectedOwner) setLocal({ owner: expectedOwner, ready: true, value });
  };
  const activate = async () => {
    const expectedOwner = owner, generation = ++action.current;
    await acquirePushToken();
    if (ownerRef.current !== expectedOwner || generation !== action.current) throw Error("Your account changed. Please enable reminders again.");
    setGranted(true);
    return expectedOwner;
  };
  const setEnabled = async (enabled: boolean) => {
    if (!ready || !account.canEdit) throw Error("Wait for your saved settings to load.");
    if (acting.current) return;
    acting.current = true; setBusy(true);
    const expectedOwner = owner;
    try {
      if (enabled) await activate();
      else action.current++;
      if (ownerRef.current !== expectedOwner) return;
      // Consent is a new, explicit device decision. The legacy preview boolean
      // alone can never activate a phone or cause a permission request.
      await save({ consent: enabled, oneTime: enabled ? preferences.oneTime : [] }, expectedOwner);
      if (ownerRef.current !== expectedOwner) return;
      await account.setNotifications(enabled);
      if (ownerRef.current !== expectedOwner) return;
      setSyncError(null); refresh();
    } finally { if (ownerRef.current === expectedOwner) { acting.current = false; setBusy(false); } }
  };
  const setOneTime = async (showId: string, startsAt: string, enabled: boolean) => {
    if (!ready) throw Error("Wait for your saved reminders to load.");
    if (acting.current) return;
    acting.current = true; setBusy(true);
    const expectedOwner = owner;
    try {
      if (enabled && (!preferences.consent || !(await permissionGranted()))) await activate();
      if (ownerRef.current !== expectedOwner) return;
      const future = Date.parse(startsAt);
      if (enabled && (!Number.isFinite(future) || future <= Date.now() || future > Date.now() + 14 * 86400_000)) throw Error("This show is no longer upcoming. Refresh the schedule.");
      const key = reminderKey({ showId, startsAt });
      const oneTime = preferences.oneTime.filter(item => Date.parse(item.startsAt) > Date.now() && reminderKey(item) !== key);
      if (enabled) oneTime.push({ showId, startsAt, leadMinutes: future - account.reminderLeadMinutes * 60_000 > Date.now() ? account.reminderLeadMinutes : 0 });
      if (oneTime.length > 50) throw Error("You already have 50 upcoming reminders. Remove one before adding another.");
      await save({ consent: enabled || preferences.consent, oneTime }, expectedOwner);
      setSyncError(null); refresh();
    } finally { if (ownerRef.current === expectedOwner) { acting.current = false; setBusy(false); } }
  };

  useEffect(() => {
    let current = true;
    const subscriptions: { remove(): void }[] = [];
    const opened = new Set<string>();
    let tap = 0;
    void (async () => {
      const notifications = await notificationApi();
      if (!notifications || !current) return;
      try {
        const history = JSON.parse((await AsyncStorage.getItem(OPENED_KEY)) ?? "[]");
        if (Array.isArray(history)) history.filter(item => typeof item === "string").slice(-40).forEach(item => opened.add(item));
      } catch { /* A malformed old history cannot prevent opening a new tap. */ }
      if (!current) return;
      notifications.setNotificationHandler({ handleNotification: async notification => {
        const data = parseShowReminder(notification.request.content.data);
        const playingSame = data && latest.current.radio.playing && latest.current.radio.currentShow?.id === data.showId;
        return { shouldPlaySound: !playingSame, shouldSetBadge: false, shouldShowBanner: !playingSame, shouldShowList: !playingSame };
      } });
      const respond = async (response: import("expo-notifications").NotificationResponse) => {
        if (!current || response.actionIdentifier !== notifications.DEFAULT_ACTION_IDENTIFIER) return;
        const reminder = parseShowReminder(response.notification.request.content.data);
        const id = response.notification.request.identifier;
        if (!reminder || opened.has(id)) return;
        opened.add(id);
        const generation = ++tap;
        setNotice("Opening your show…");
        setOpening(null);
        setPending({ id, reminder, refreshed: false });
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          // Refresh stale cached schedules, but never hold startup or navigation
          // hostage to a push token or an indefinite network request.
          await Promise.race([latest.current.content.refresh().catch(() => {}), new Promise<void>(resolve => { timeout = setTimeout(resolve, 12_000); })]);
        } finally {
          if (timeout) clearTimeout(timeout);
          if (current && tap === generation) setPending({ id, reminder, refreshed: true });
        }
      };
      subscriptions.push(notifications.addNotificationResponseReceivedListener(response => { void respond(response); }));
      subscriptions.push(notifications.addPushTokenListener(() => { invalidatePushToken(); refresh(); }));
      const initial = await notifications.getLastNotificationResponseAsync();
      if (initial && current && tap === 0) void respond(initial);
    })().catch(() => { /* Unsupported/missing native push services never block the app. */ });
    return () => { current = false; tap++; subscriptions.forEach(subscription => subscription.remove()); };
  }, [refresh]);

  useEffect(() => {
    if (!pending?.refreshed || !startupReady || !navigation?.key || content.loading) return;
    const decision = notificationOpenAction(pending.reminder, content.shows);
    let current = true;
    void (async () => {
      try {
        const previous = JSON.parse((await AsyncStorage.getItem(OPENED_KEY)) ?? "[]");
        await AsyncStorage.setItem(OPENED_KEY, JSON.stringify([...(Array.isArray(previous) ? previous : []), pending.id].slice(-40)));
      } catch { /* In-memory deduplication still guards this session. */ }
      if (!current) return;
      const path = decision.showId ? `/show/${decision.showId}` : "/";
      setNotice(decision.message);
      setPending(null);
      setOpening({ path, play: decision.play, preferredShow: decision.preferredShow });
      if (decision.showId) router.navigate({ pathname: "/show/[id]", params: { id: decision.showId } });
      else router.navigate("/");
      void notificationApi()?.then(api => api.clearLastNotificationResponseAsync()).catch(() => {});
    })();
    return () => { current = false; };
  }, [pending, startupReady, navigation?.key, content.loading, content.shows]);

  useEffect(() => {
    if (!opening || !startupReady || pathname !== opening.path) return;
    const frame = requestAnimationFrame(() => {
      if (opening.play) radio.listenNow(opening.preferredShow);
      setOpening(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [opening, pathname, startupReady, radio.listenNow]);

  const unsupported = pushUnsupportedReason();
  const enabled = preferences.consent && account.notificationsEnabled;
  const blocked = preferences.consent && granted === false && !unsupported;
  const status = unsupported ?? (!ready ? "Loading saved reminders…" : blocked ? "Notifications are blocked on this phone. Open phone settings to allow them." :
    syncError ?? (syncing ? "Syncing reminders…" : preferences.consent && !deliveryReady ? "Choices saved. Reminder delivery is being set up." :
      enabled && account.reminderScope === "favorites" && !account.favorites.length ? "Save a favourite show to receive reminders." :
      enabled ? "Show reminders are enabled on this phone." : account.notificationsEnabled && !preferences.consent ? "Enable reminders on this phone to finish setup." :
      preferences.oneTime.length ? "One-time show reminders are saved on this phone." : "Choose which shows you want to hear about."));
  return <Context.Provider value={{ enabled, ready, busy, syncing, status, blocked, unsupported: !!unsupported,
    deliveryActive: !unsupported && preferences.consent && granted === true && deliveryReady && !syncError && !syncing,
    notice, oneTime: preferences.oneTime, setEnabled, setOneTime, refresh,
    openSettings: () => Linking.openSettings(), dismissNotice: () => setNotice(null),
  }}>{children}</Context.Provider>;
}

export function usePushNotifications() {
  const context = useContext(Context);
  if (!context) throw Error("Push reminders require PushNotificationProvider");
  return context;
}
