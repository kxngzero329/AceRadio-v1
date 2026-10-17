import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { accountConfig, getAuthClient } from "@/services/authClient";
type AuthState = {
  session: Session | null;
  loading: boolean;
  available: boolean;
  recovery: boolean;
  finishRecovery: () => void;
  error: string | null;
  retry: () => void;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!accountConfig.error);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (accountConfig.error) return;
    let alive = true,
      changed = false;
    const client = getAuthClient();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      changed = true;
      setSession(next);
      setLoading(false);
      setError(null);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
    });
    void client.auth
      .getSession()
      .then(({ data, error: restoreError }) => {
        if (!alive || changed) return;
        if (restoreError)
          setError("Unable to restore your account. Try reconnecting.");
        else setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setLoading(false);
          setError("Secure account storage is unavailable. Please try again.");
        }
      });
    const update = (state: string) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    if (Platform.OS !== "web") update(AppState.currentState);
    const app =
      Platform.OS !== "web"
        ? AppState.addEventListener("change", update)
        : null;
    return () => {
      alive = false;
      subscription.unsubscribe();
      app?.remove();
      if (Platform.OS !== "web") client.auth.stopAutoRefresh();
    };
  }, [attempt]);
  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        recovery,
        finishRecovery: () => setRecovery(false),
        available: !accountConfig.error,
        error,
        retry: () => {
          setLoading(true);
          setError(null);
          setAttempt((value) => value + 1);
        },
        signOut: async () => {
          const { error } = await getAuthClient().auth.signOut({
            scope: "local",
          });
          if (error) throw error;
          setSession(null);
          setRecovery(false);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw Error("useAuth requires AuthProvider");
  return state;
}
