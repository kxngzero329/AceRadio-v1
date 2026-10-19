import type { StationEvent } from "@/types/content";

export function eventPhase(
  event: StationEvent,
  now: number,
): "upcoming" | "live" | "past" {
  if (Date.parse(event.startsAt) > now) return "upcoming";
  if (event.endsAt && Date.parse(event.endsAt) > now) return "live";
  // With no end time, we only know that the advertised start is in the past.
  return "past";
}

export function upcomingEvents(events: StationEvent[], now: number) {
  return events
    .filter((event) => eventPhase(event, now) !== "past")
    .sort(
      (a, b) =>
        Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
        a.id.localeCompare(b.id),
    );
}

const date = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const time = new Intl.DateTimeFormat("en-ZA", {
  timeZone: "Africa/Johannesburg",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function eventSchedule(event: StationEvent) {
  const start = new Date(event.startsAt);
  const startDate = date.format(start);
  if (!event.endsAt) return `${startDate} · ${time.format(start)} SAST`;
  const end = new Date(event.endsAt);
  return date.format(end) === startDate
    ? `${startDate} · ${time.format(start)}–${time.format(end)} SAST`
    : `${startDate}, ${time.format(start)} – ${date.format(end)}, ${time.format(end)} SAST`;
}
