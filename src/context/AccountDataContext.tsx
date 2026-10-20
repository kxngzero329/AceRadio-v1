import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { randomUUID } from "expo-crypto";
import { useAuth } from "@/context/AuthContext";
import { accountConfig } from "@/services/authClient";
import { accountApi } from "@/services/accountRepository";
import { AccountSync, type SyncState } from "@/utils/AccountSync";
import type { ReminderScope, ReminderLead } from "@/types/notifications";
import {
  readGuestAccountTransfer,
  saveGuestAccountTransfer,
  clearGuestAccountTransfer,
  type GuestAccountTransfer,
} from "@/services/guestAccountTransfer";
import {
  readDevicePreferences,
  saveDevicePreferences,
} from "@/services/pushNotifications";
import {
  getNotificationsEnabled,
  enableNotifications,
  disableNotifications,
} from "@/services/notifications";

const GUEST_KEY = "aceradio:favorites:v1";
type AccountData = {
  favorites: string[];
  notificationsEnabled: boolean;
  reminderScope: ReminderScope;
  reminderLeadMinutes: ReminderLead;
  ready: boolean;
  canEdit: boolean;
  syncing: boolean;
  pending: number;
  error: string | null;
  notice: string | null;
  lastSynced: number | null;
  role: "user" | "admin";
  displayName: string;
  guestImportCount: number;
  guestImportAvailable: boolean;
  signedIn: boolean;
  transferringGuest: boolean;
  toggleFavorite(id: string): void;
  setNotifications(value: boolean): Promise<void>;
  setReminderOptions(
    scope: ReminderScope,
    leadMinutes: ReminderLead,
  ): Promise<void>;
  updateName(value: string): Promise<void>;
  importGuest(): Promise<void>;
  transferGuestAfterSignup(userId: string): Promise<void>;
  refresh(): Promise<void>;
  clearAccountCache(): Promise<void>;
};
const Context = createContext<AccountData | null>(null);
const empty: SyncState = {
  account: null,
  ready: false,
  syncing: false,
  pending: 0,
  error: null,
  notice: null,
  lastSynced: null,
};
const noopSubscribe = () => () => {};
const emptySnapshot = () => empty;

export function AccountDataProvider({ children }: PropsWithChildren) {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  return (
    <ScopedAccountData userId={userId} authLoading={loading}>
      {children}
    </ScopedAccountData>
  );
}
function ScopedAccountData({
  children,
  userId,
  authLoading,
}: PropsWithChildren<{ userId: string | null; authLoading: boolean }>) {
  // Switch only the data owner, keeping radio/navigation mounted through sign-in/out.
  const engine = useMemo(
    () =>
      userId
        ? new AccountSync(
            userId,
            `aceradio:account:v1:${accountConfig.url}:${userId}`,
            AsyncStorage,
            accountApi,
            randomUUID,
          )
        : null,
    [userId],
  );
  const currentOwner = useRef(userId);
  currentOwner.current = userId;
  const currentEngine = useRef(engine);
  currentEngine.current = engine;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const state = useSyncExternalStore(
    engine?.subscribe ?? noopSubscribe,
    engine?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const [guest, setGuest] = useState<string[]>([]);
  const guestRef = useRef(guest);
  const [guestNotifications, setGuestNotifications] = useState(false);
  const [guestOptions, setGuestOptions] = useState<{
    scope: ReminderScope;
    leadMinutes: ReminderLead;
  }>({ scope: "favorites", leadMinutes: 5 });
  const [guestReady, setGuestReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const guestWrite = useRef<Promise<void>>(Promise.resolve());
  const [transfer, setTransfer] = useState<{
    userId: string;
    value: GuestAccountTransfer;
  } | null>(null);
  const transferRunning = useRef(false);
  const [transferAttempt, setTransferAttempt] = useState(0);
  useEffect(() => {
    if (!userId) {
      setTransfer(null);
      return;
    }
    let current = true;
    void readGuestAccountTransfer(userId)
      .then((value) => {
        if (current && value) setTransfer({ userId, value });
      })
      .catch(() => {
        if (current)
          setLocalError(
            "Couldn't restore device favourites. Your original guest choices are still on this phone.",
          );
      });
    return () => {
      current = false;
    };
  }, [userId]);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      AsyncStorage.getItem(GUEST_KEY),
      getNotificationsEnabled(),
      AsyncStorage.getItem("aceradio:guest-reminder-options:v1"),
    ])
      .then(([raw, preference, rawOptions]) => {
        if (!alive) return;
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const ids = Array.isArray(parsed)
          ? [
              ...new Set(
                parsed.filter(
                  (id): id is string =>
                    typeof id === "string" &&
                    /^[a-z0-9][a-z0-9-]{0,199}$/.test(id),
                ),
              ),
            ].slice(0, 2000)
          : [];
        guestRef.current = ids;
        setGuest(ids);
        setGuestNotifications(preference);
        if (rawOptions) {
          try {
            const saved = JSON.parse(rawOptions);
            setGuestOptions({
              scope: saved.scope === "all" ? "all" : "favorites",
              leadMinutes: [0, 5, 10, 15].includes(saved.leadMinutes)
                ? saved.leadMinutes
                : 5,
            });
          } catch {
            /* Keep safe defaults if an old device preference is corrupt. */
          }
        }
      })
      .catch(() => {
        if (alive)
          setLocalError("Unable to read saved preferences on this device.");
      })
      .finally(() => {
        if (alive) setGuestReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!engine) return;
    let connected = true;
    let foreground =
      Platform.OS === "web"
        ? typeof document === "undefined" || !document.hidden
        : AppState.currentState === "active";
    const update = () => engine.setOnline(connected && foreground);
    update();
    void engine.start();
    const network = NetInfo.addEventListener((status) => {
      connected =
        status.isConnected !== false && status.isInternetReachable !== false;
      update();
    });
    const app = AppState.addEventListener("change", (status) => {
      if (Platform.OS !== "web") {
        foreground = status === "active";
        update();
      }
    });
    const visibility = () => {
      foreground = !document.hidden;
      update();
    };
    if (Platform.OS === "web" && typeof document !== "undefined")
      document.addEventListener("visibilitychange", visibility);
    const poll = setInterval(() => {
      if (foreground && connected) void engine.refresh();
    }, 30_000);
    return () => {
      engine.stop();
      if (currentOwner.current !== engine.userId)
        void engine.clear().catch(() => {});
      network();
      app.remove();
      clearInterval(poll);
      if (Platform.OS === "web" && typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visibility);
    };
  }, [engine]);
  const persistGuest = async (next: string[]) => {
    guestRef.current = next;
    setGuest(next);
    guestWrite.current = guestWrite.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(GUEST_KEY, JSON.stringify(next)));
    try {
      await guestWrite.current;
      setLocalError(null);
    } catch {
      setLocalError(
        "Device storage is unavailable. Your changes could not be saved.",
      );
      throw Error("Unable to save on this device.");
    }
  };
  const account = state.account;
  const activeTransfer = transfer?.userId === userId ? transfer.value : null;
  useEffect(() => {
    if (
      !engine ||
      !activeTransfer ||
      !state.ready ||
      !state.account ||
      transferRunning.current
    )
      return;
    const target = engine;
    const value = activeTransfer;
    const current = () =>
      mounted.current &&
      currentOwner.current === target.userId &&
      currentEngine.current === target;
    let needsAnotherBatch = false;
    transferRunning.current = true;
    void (async () => {
      try {
        // Small durable batches respect the account outbox limit. Successfully
        // queued choices appear optimistically and survive network interruption.
        const missing = (value.remaining ?? value.favorites).filter(
          (id) =>
            !target
              .getSnapshot()
              .account?.favorites.some((row) => row.show_id === id),
        );
        const capacity = Math.max(
          0,
          Math.min(50, 198 - target.getSnapshot().pending),
        );
        if (!current()) return;
        if (capacity > 0 && missing.length)
          await target.enqueueMany(
            missing
              .slice(0, capacity)
              .map((id) => ({ kind: "favorite", show_id: id, value: true })),
          );
        if (!current()) return;
        if (missing.length > capacity) {
          if (capacity > 0) {
            const updated = { ...value, remaining: missing.slice(capacity) };
            await saveGuestAccountTransfer(target.userId, updated);
            if (current())
              setTransfer({ userId: target.userId, value: updated });
          }
          needsAnotherBatch =
            capacity > 0 && target.getSnapshot().pending < 198;
          return;
        }
        const settings = target.getSnapshot().account!.settings;
        if (
          settings.revision === 0 &&
          (settings.notifications_enabled !== value.notificationsEnabled ||
            settings.reminder_scope !== value.scope ||
            settings.reminder_lead_minutes !== value.leadMinutes)
        ) {
          await target.enqueue({
            kind: "settings",
            value: value.notificationsEnabled,
            scope: value.scope,
            leadMinutes: value.leadMinutes,
          });
        }
        if (!current()) return;
        await saveDevicePreferences(target.userId, value.push);
        if (!current()) return;
        await clearGuestAccountTransfer(target.userId);
        if (current()) {
          setTransfer(null);
          setLocalError(null);
        }
      } catch {
        if (current())
          setLocalError(
            "Your device favourites are safe. Reconnect or refresh to finish adding them to your account.",
          );
      } finally {
        transferRunning.current = false;
        // Enqueue publishes before its storage write finishes. Recheck after
        // that write too, rather than losing a wake-up during a fast batch.
        if (mounted.current && (!current() || needsAnotherBatch))
          setTransferAttempt((value) => value + 1);
      }
    })();
  }, [
    engine,
    activeTransfer,
    state.ready,
    state.account,
    state.pending,
    transferAttempt,
  ]);
  const favorites = useMemo(
    () =>
      userId
        ? [
            ...new Set([
              ...(activeTransfer?.favorites.filter(
                (id) => !account?.favorites.some((row) => row.show_id === id),
              ) ?? []),
              ...(account?.favorites
                .filter((row) => row.is_favorite)
                .map((row) => row.show_id) ?? []),
            ]),
          ]
        : guest,
    [account, activeTransfer, guest, userId],
  );
  const canEdit =
    !authLoading &&
    !activeTransfer &&
    (userId ? !!account && state.ready : guestReady);
  const ready =
    !authLoading &&
    (userId ? state.ready && (!!account || !!state.error) : guestReady);
  const guestToImport = guest.filter(
    (id) => !account?.favorites.some((row) => row.show_id === id),
  );
  return (
    <Context.Provider
      value={{
        favorites,
        notificationsEnabled: userId
          ? (account?.settings.notifications_enabled ?? false)
          : guestNotifications,
        reminderScope: userId
          ? (account?.settings.reminder_scope ?? "favorites")
          : guestOptions.scope,
        reminderLeadMinutes: userId
          ? (account?.settings.reminder_lead_minutes ?? 5)
          : guestOptions.leadMinutes,
        ready,
        canEdit,
        syncing: state.syncing,
        pending: state.pending,
        error: localError ?? state.error,
        notice: state.notice,
        lastSynced: state.lastSynced,
        role: account?.role ?? "user",
        displayName: account?.profile.display_name ?? "Listener",
        signedIn: !!userId,
        transferringGuest: !!activeTransfer,
        guestImportCount: guestToImport.length,
        guestImportAvailable:
          guestReady &&
          (guestToImport.length > 0 ||
            (guestNotifications && account?.settings.revision === 0)),
        toggleFavorite: (id) => {
          if (!canEdit) {
            setLocalError("Wait for your saved shows to load, then try again.");
            return;
          }
          const current = userId
            ? (engine!
                .getSnapshot()
                .account?.favorites.some(
                  (row) => row.show_id === id && row.is_favorite,
                ) ?? false)
            : guestRef.current.includes(id);
          void (
            engine
              ? engine.enqueue({
                  kind: "favorite",
                  show_id: id,
                  value: !current,
                })
              : persistGuest(
                  current
                    ? guestRef.current.filter((value) => value !== id)
                    : [...guestRef.current, id],
                )
          ).catch((error) =>
            setLocalError(
              error instanceof Error
                ? error.message
                : "Unable to save that show.",
            ),
          );
        },
        setNotifications: async (value) => {
          if (!canEdit) throw Error("Wait for your settings to load.");
          if (engine) await engine.enqueue({ kind: "settings", value });
          else {
            if (value) await enableNotifications();
            else await disableNotifications();
            setGuestNotifications(value);
          }
          setLocalError(null);
        },
        setReminderOptions: async (scope, leadMinutes) => {
          if (!canEdit) throw Error("Wait for your settings to load.");
          if (engine)
            await engine.enqueue({
              kind: "settings",
              value:
                engine.getSnapshot().account?.settings.notifications_enabled ??
                false,
              scope,
              leadMinutes,
            });
          else {
            await AsyncStorage.setItem(
              "aceradio:guest-reminder-options:v1",
              JSON.stringify({ scope, leadMinutes }),
            );
            setGuestOptions({ scope, leadMinutes });
          }
        },
        updateName: async (value) => {
          if (!engine || !canEdit)
            throw Error("Connect to your account first.");
          await engine.enqueue({ kind: "profile", value: value.trim() });
          setLocalError(null);
        },
        importGuest: async () => {
          if (!engine || !account || !guestReady)
            throw Error("Wait for your account to load.");
          for (const id of guest)
            if (
              !engine
                .getSnapshot()
                .account?.favorites.some((row) => row.show_id === id)
            )
              await engine.enqueue({
                kind: "favorite",
                show_id: id,
                value: true,
              });
          if (guestNotifications && account.settings.revision === 0)
            await engine.enqueue({ kind: "settings", value: true });
          await persistGuest([]);
          await disableNotifications();
          setGuestNotifications(false);
        },
        transferGuestAfterSignup: async (targetUserId) => {
          await guestWrite.current;
          const value: GuestAccountTransfer = {
            version: 1,
            favorites: [...guestRef.current],
            notificationsEnabled: guestNotifications,
            scope: guestOptions.scope,
            leadMinutes: guestOptions.leadMinutes,
            push: await readDevicePreferences("guest"),
          };
          await saveGuestAccountTransfer(targetUserId, value);
          setTransfer({ userId: targetUserId, value });
        },
        refresh: async () => {
          setLocalError(null);
          setTransferAttempt((value) => value + 1);
          if (engine) await engine.refresh();
        },
        clearAccountCache: async () => {
          if (engine) await engine.clear();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAccountData() {
  const data = useContext(Context);
  if (!data) throw Error("useAccountData requires AccountDataProvider");
  return data;
}
