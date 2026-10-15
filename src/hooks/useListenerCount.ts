import { useEffect, useState, useSyncExternalStore } from "react";
import { focusManager, useQuery } from "@tanstack/react-query";
import { fetchListenerSample, freshListenerCount, LISTENER_REFRESH_MS, listenerQueryKey, listenerStatsUrl } from "@/services/listenerStats";

const subscribeFocus = (onChange: () => void) => focusManager.subscribe(onChange);
const isFocused = () => focusManager.isFocused();

/** One shared, ephemeral stream count. Never persisted with the content catalogue. */
export function useListenerCount(): number | null {
  const focused = useSyncExternalStore(subscribeFocus, isFocused, () => true);
  const [, expire] = useState(0);
  const query = useQuery({
    queryKey: listenerQueryKey, queryFn: ({ signal }) => fetchListenerSample(signal),
    enabled: !!listenerStatsUrl && focused,
    staleTime: 10_000, gcTime: 60_000, retry: false,
    refetchInterval: LISTENER_REFRESH_MS, refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always", refetchOnReconnect: "always", refetchOnMount: "always",
  });
  useEffect(() => {
    if (!focused || !query.data) return;
    const remaining = query.data.expiresAt - Date.now();
    if (remaining <= 0) return;
    // Expire once at the deadline, avoiding a screen-wide rerender every second.
    const timer = setTimeout(() => expire(value => value + 1), remaining);
    return () => clearTimeout(timer);
  }, [focused, query.data]);
  return focused && !query.isError ? freshListenerCount(query.data) : null;
}
