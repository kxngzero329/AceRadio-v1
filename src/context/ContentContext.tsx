import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, focusManager, useQuery, useIsRestoring } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { contentConfig } from "@/config/content";
import { bundledContent } from "@/data/bundledContent";
import { contentQueryKey, decodeContent, emptyContent, fetchAppContent, isContentInWindow } from "@/services/contentRepository";
import type { AppContent } from "@/types/content";

const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
export const queryClient = new QueryClient({ defaultOptions: { queries: {
  staleTime: 60_000, gcTime: MAX_CACHE_AGE, retry: 2, refetchOnWindowFocus: true, refetchOnReconnect: true,
} } });
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: `aceradio:content:v1:${contentConfig.url}`, throttleTime: 1000 });
type ContentState = AppContent & { source: "supabase" | "bundled"; loading: boolean; refreshing: boolean; error: string | null; refresh: () => Promise<void> };
const ContentContext = createContext<ContentState | null>(null);
const selectContent = (value: unknown) => decodeContent(value, contentConfig.url);

function ContentStateProvider({ children }: PropsWithChildren) {
  const restoring = useIsRestoring();
  const [now, setNow] = useState(Date.now);
  const remote = contentConfig.source === "supabase";
  const query = useQuery({ queryKey: contentQueryKey, queryFn: ({ signal }) => fetchAppContent(signal),
    select: selectContent, enabled: remote && !contentConfig.error, refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === "active" || Platform.OS === "web") setNow(Date.now()); }, 30_000);
    const app = AppState.addEventListener("change", state => {
      if (Platform.OS !== "web") focusManager.setFocused(state === "active");
      if (state === "active") setNow(Date.now());
    });
    return () => { clearInterval(timer); app.remove(); };
  }, []);
  const content = remote ? query.data ?? emptyContent : bundledContent;
  const value = useMemo<ContentState>(() => ({ ...content,
    banners: content.banners.filter(item => isContentInWindow(item, now)),
    announcements: content.announcements.filter(item => isContentInWindow(item, now)),
    source: contentConfig.source,
    loading: remote && !contentConfig.error && (restoring || query.isPending),
    refreshing: remote && query.isFetching,
    error: remote ? contentConfig.error ?? (query.isError ? (query.data ? "Unable to refresh. Showing saved station content." : "Unable to load station content. Please try again.") : null) : null,
    refresh: async () => { if (remote && !contentConfig.error) await query.refetch(); },
  }), [content, now, remote, restoring, query.isPending, query.isFetching, query.isError, query.data, query.refetch]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function ContentProvider({ children }: PropsWithChildren) {
  return <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: MAX_CACHE_AGE,
    buster: `content-v1:${contentConfig.source}:${contentConfig.url}`,
    dehydrateOptions: { shouldDehydrateQuery: query => query.queryKey[0] === "app-content" && query.state.status === "success" },
  }}><ContentStateProvider>{children}</ContentStateProvider></PersistQueryClientProvider>;
}
export function useContent() {
  const context = useContext(ContentContext);
  if (!context) throw new Error("useContent must be inside ContentProvider");
  return context;
}
