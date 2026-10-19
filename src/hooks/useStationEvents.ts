import {
  useIsRestoring,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { contentConfig } from "@/config/content";
import { useContent } from "@/context/ContentContext";
import {
  decodeEvent,
  decodeEvents,
  eventDetailKey,
  eventRowsSchema,
  fetchEvent,
  fetchUpcomingEvents,
  upcomingEventsKey,
  validEventId,
} from "@/services/eventsRepository";
import { upcomingEvents } from "@/utils/events";

const remote = contentConfig.source === "supabase";
const enabled = remote && !contentConfig.error;
const refreshOptions = {
  refetchInterval: 60_000,
  refetchIntervalInBackground: false,
  retry: 1,
} as const;

export function useUpcomingEvents() {
  const restoring = useIsRestoring();
  const { now } = useContent();
  const query = useQuery({
    queryKey: upcomingEventsKey,
    queryFn: ({ signal }) => fetchUpcomingEvents(signal),
    select: decodeEvents,
    enabled,
    ...refreshOptions,
  });
  return {
    events: upcomingEvents(query.data ?? [], now),
    now,
    loading: enabled && (restoring || query.isPending),
    refreshing: query.isFetching,
    error:
      remote && (contentConfig.error || query.isError)
        ? query.data
          ? "Unable to refresh events. Showing saved events."
          : "Events are unavailable right now."
        : null,
    refresh: async () => {
      if (enabled) await query.refetch();
    },
  };
}

export function useStationEvent(id: string) {
  const cache = useQueryClient();
  const restoring = useIsRestoring();
  const { now } = useContent();
  const cached = eventRowsSchema.safeParse(
    cache.getQueryData(upcomingEventsKey),
  );
  const initialData = cached.success
    ? cached.data.find((event) => event.id === id)
    : undefined;
  const canFetch = enabled && validEventId(id);
  const query = useQuery({
    queryKey: eventDetailKey(id),
    queryFn: ({ signal }) => fetchEvent(id, signal),
    select: decodeEvent,
    enabled: canFetch,
    initialData,
    initialDataUpdatedAt: initialData
      ? cache.getQueryState(upcomingEventsKey)?.dataUpdatedAt
      : undefined,
    ...refreshOptions,
  });
  return {
    event: query.data ?? null,
    now,
    loading: canFetch && (restoring || query.isPending),
    refreshing: query.isFetching,
    error:
      remote && (contentConfig.error || query.isError)
        ? query.data
          ? "Unable to refresh this event. Showing saved details."
          : "Unable to load this event."
        : null,
    refresh: async () => {
      if (canFetch) await query.refetch();
    },
  };
}
