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
import {
  getNotificationsEnabled,
  enableNotifications,
  disableNotifications,
} from "@/services/notifications";

const GUEST_KEY = "aceradio:favorites:v1";
type AccountData = {
  favorites: string[];
  notificationsEnabled: boolean;
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
  toggleFavorite(id: string): void;
  setNotifications(value: boolean): Promise<void>;
  updateName(value: string): Promise<void>;
  importGuest(): Promise<void>;
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
  const state = useSyncExternalStore(
    engine?.subscribe ?? noopSubscribe,
    engine?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const [guest, setGuest] = useState<string[]>([]);
  const guestRef = useRef(guest);
  const [guestNotifications, setGuestNotifications] = useState(false);
  const [guestReady, setGuestReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const guestWrite = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let alive = true;
    void Promise.all([
      AsyncStorage.getItem(GUEST_KEY),
      getNotificationsEnabled(),
    ])
      .then(([raw, preference]) => {
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
  const favorites = useMemo(
    () =>
      userId
        ? (account?.favorites
            .filter((row) => row.is_favorite)
            .map((row) => row.show_id) ?? [])
        : guest,
    [account, guest, userId],
  );
  const canEdit =
    !authLoading && (userId ? !!account && state.ready : guestReady);
  const ready =
    !authLoading &&
    (userId ? state.ready && (!!account || !!state.error) : guestReady);
  return (
    <Context.Provider
      value={{
        favorites,
        notificationsEnabled: userId
          ? (account?.settings.notifications_enabled ?? false)
          : guestNotifications,
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
        guestImportCount: guest.length,
        guestImportAvailable:
          guestReady && (guest.length > 0 || guestNotifications),
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
        refresh: async () => {
          setLocalError(null);
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
