import type { Show, ShowSchedule } from "@/types/show";

export const SAST_TIME_ZONE = "Africa/Johannesburg";
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayIndexes: Record<string, number[]> = Object.fromEntries(names.map((name, day) => [name, [day]]));
dayIndexes.Weekdays = [1,2,3,4,5];
const timeSlots = /^.*?(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i;
const minutes = (time: string) => Number(time.slice(0,2)) * 60 + Number(time.slice(3,5));

function legacyTime(hourText: string, minuteText: string, period: string) {
  const hour = Number(hourText), minute = Number(minuteText);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const value = (hour % 12 + (period.toUpperCase() === "PM" ? 12 : 0)) * 60 + minute;
  return `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;
}

/** Bundled mode retains its printed schedules. Database mode always uses structured slots. */
function slots(show: Show): ShowSchedule[] {
  if (show.schedules) return show.schedules;
  const match = timeSlots.exec(show.schedule), days = dayIndexes[show.day];
  if (!match || !days) return [];
  const start = legacyTime(match[1], match[2], match[3]), end = legacyTime(match[4], match[5], match[6]);
  if (!start || !end || start === end) return [];
  return days.map(day => ({ day, start, end, validFrom: null, validUntil: null }));
}
function startDay(date: Date) {
  const sast = new Date(date.getTime() + SAST_OFFSET_MS);
  return Date.UTC(sast.getUTCFullYear(), sast.getUTCMonth(), sast.getUTCDate());
}
function validDay(slot: ShowSchedule, day: number) {
  const date = new Date(day).toISOString().slice(0,10);
  return new Date(day).getUTCDay() === slot.day &&
    (!slot.validFrom || date >= slot.validFrom) && (!slot.validUntil || date <= slot.validUntil);
}
export function isShowLive(show: Show, at = new Date()): boolean {
  const localNow = at.getTime() + SAST_OFFSET_MS, today = startDay(at);
  return slots(show).some(slot => [today, today - DAY_MS].some(day => {
    if (!validDay(slot, day)) return false;
    const start = day + minutes(slot.start) * 60_000;
    const end = day + minutes(slot.end) * 60_000 + (slot.end <= slot.start ? DAY_MS : 0);
    return localNow >= start && localNow < end;
  }));
}
export function getLiveShows(lineup: readonly Show[], at = new Date()): Show[] {
  return lineup.filter(show => isShowLive(show, at));
}
export function getNextScheduledShow(lineup: readonly Show[], at = new Date()): { show: Show; startsAt: Date } | null {
  const today = startDay(at);
  let next: { show: Show; startsAt: Date } | null = null;
  for (const show of lineup) for (const slot of slots(show)) {
    const firstDay = Math.max(today, slot.validFrom ? Date.parse(slot.validFrom + "T00:00:00Z") : today);
    for (let offset = 0; offset <= 7; offset++) {
      const day = firstDay + offset * DAY_MS;
      if (!validDay(slot, day)) continue;
      const startsAt = new Date(day + minutes(slot.start) * 60_000 - SAST_OFFSET_MS);
      if (startsAt <= at) continue;
      if (!next || startsAt < next.startsAt) next = { show, startsAt };
      break;
    }
  }
  return next;
}

/** Validate a notification against the currently published slot, including overnight ends. */
export function getShowOccurrence(show: Show, startsAt: string) {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return null;
  const day = startDay(new Date(start));
  for (const slot of slots(show)) {
    const actualStart = day + minutes(slot.start) * 60_000 - SAST_OFFSET_MS;
    if (!validDay(slot, day) || actualStart !== start) continue;
    const end = day + minutes(slot.end) * 60_000 - SAST_OFFSET_MS + (slot.end <= slot.start ? DAY_MS : 0);
    return { startsAt: new Date(start), endsAt: new Date(end) };
  }
  return null;
}
function displayTime(value: string) {
  const hour = Number(value.slice(0,2));
  return `${hour % 12 || 12}:${value.slice(3,5)} ${hour < 12 ? "AM" : "PM"}`;
}
export function formatShowSchedule(schedules: ShowSchedule[]): { day: string; schedule: string } {
  if (!schedules.length) return { day: "", schedule: "Schedule to be announced" };
  const groups = new Map<string, { start: string; end: string; days: number[] }>();
  for (const slot of schedules) {
    const key = `${slot.start}-${slot.end}-${slot.validFrom}-${slot.validUntil}`;
    const group = groups.get(key) ?? { start: slot.start, end: slot.end, days: [] };
    if (!group.days.includes(slot.day)) group.days.push(slot.day);
    groups.set(key, group);
  }
  const label = (days: number[]) => {
    const ordered = [...days].sort((a,b) => (a || 7) - (b || 7));
    if (ordered.join() === "1,2,3,4,5") return "Weekdays";
    if (ordered.join() === "6,0") return "Weekend";
    return ordered.map(day => names[day]).join(", ");
  };
  return {
    day: label([...new Set(schedules.map(slot => slot.day))]),
    schedule: [...groups.values()].map(group => `${label(group.days)} • ${displayTime(group.start)} – ${displayTime(group.end)}`).join(" · "),
  };
}
