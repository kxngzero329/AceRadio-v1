import { z } from "zod";
import { getSupabaseClient } from "@/services/supabase";
import { contentConfig } from "@/config/content";
import type { StationEvent } from "@/types/content";

// An invalid optional URL must never become a link or prevent the event's text
// from rendering. Published copy and dates still have to satisfy the contract.
const optionalHttps = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"))
  .nullable()
  .catch(null);
export const eventRowSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1),
    description: z.string(),
    starts_at: z.iso.datetime({ offset: true }),
    ends_at: z.iso.datetime({ offset: true }).nullable(),
    location: z.string().nullable(),
    image_url: optionalHttps,
    booking_url: optionalHttps,
    status: z.literal("published"),
  })
  .refine(
    (row) =>
      row.ends_at === null ||
      Date.parse(row.ends_at) > Date.parse(row.starts_at),
    "Invalid event date range",
  );
export const eventRowsSchema = z.array(eventRowSchema);
export type EventRow = z.infer<typeof eventRowSchema>;

export const eventsCacheKey = [
  "station-events",
  1,
  contentConfig.source,
  contentConfig.url,
] as const;
export const upcomingEventsKey = [...eventsCacheKey, "upcoming"] as const;
export const eventDetailKey = (id: string) =>
  [...eventsCacheKey, "detail", id] as const;
export const validEventId = (id: string) => z.uuid().safeParse(id).success;
const columns =
  "id,title,description,starts_at,ends_at,location,image_url,booking_url,status";
const PAGE_SIZE = 100;

function mapEvent(row: EventRow): StationEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    imageUrl: row.image_url,
    bookingUrl: row.booking_url,
  };
}
export const decodeEvents = (value: unknown) =>
  eventRowsSchema.parse(value).map(mapEvent);
export const decodeEvent = (value: unknown) =>
  value === null ? null : mapEvent(eventRowSchema.parse(value));

/** One deadline covers all pages and their response bodies; caller cancellation wins. */
async function request<T>(
  signal: AbortSignal,
  action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  try {
    return await action(controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export function fetchUpcomingEvents(signal: AbortSignal): Promise<EventRow[]> {
  return request(signal, async (requestSignal) => {
    const now = new Date().toISOString();
    const events = new Map<string, EventRow>();
    // Stable ordering and pagination avoid silently truncating a growing calendar.
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await getSupabaseClient()
        .from("events")
        .select(columns)
        .eq("status", "published")
        .or(`ends_at.gt.${now},and(ends_at.is.null,starts_at.gte.${now})`)
        .order("starts_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1)
        .abortSignal(requestSignal);
      if (error) throw Error("Unable to update events.");
      const page = eventRowsSchema.parse(data);
      for (const event of page) events.set(event.id, event);
      if (page.length < PAGE_SIZE) return [...events.values()];
    }
  });
}

export function fetchEvent(
  id: string,
  signal: AbortSignal,
): Promise<EventRow | null> {
  return request(signal, async (requestSignal) => {
    const { data, error } = await getSupabaseClient()
      .from("events")
      .select(columns)
      .eq("status", "published")
      .eq("id", id)
      .abortSignal(requestSignal)
      .maybeSingle();
    if (error) throw Error("Unable to update this event.");
    return data === null ? null : eventRowSchema.parse(data);
  });
}
