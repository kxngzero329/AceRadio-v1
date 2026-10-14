import type { Show } from "@/types/show";

export const SAST_TIME_ZONE = "Africa/Johannesburg";

const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const dayIndexes: Record<string, number[]> = {
  Monday: [1],
  Tuesday: [2],
  Wednesday: [3],
  Thursday: [4],
  Friday: [5],
  Saturday: [6],
  Sunday: [0],
  Weekdays: [1, 2, 3, 4, 5],
};
const timeSlots = /^.*?(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i;

type ParsedSchedule = {
  days: number[];
  startMinutes: number;
  endMinutes: number;
};

function parseTime(hourText: string, minuteText: string, periodText: string) {
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const period = periodText.toUpperCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return (hour % 12 + (period === "PM" ? 12 : 0)) * 60 + minute;
}

function parseSchedule(show: Show): ParsedSchedule | null {
  const days = dayIndexes[show.day];
  const match = timeSlots.exec(show.schedule);
  if (!days || !match) return null;

  const startMinutes = parseTime(match[1], match[2], match[3]);
  const endMinutes = parseTime(match[4], match[5], match[6]);
  if (
    startMinutes === null ||
    endMinutes === null ||
    endMinutes <= startMinutes
  ) {
    return null;
  }

  return { days, startMinutes, endMinutes };
}

function sastDateParts(date: Date) {
  const sast = new Date(date.getTime() + SAST_OFFSET_MS);
  return {
    year: sast.getUTCFullYear(),
    month: sast.getUTCMonth(),
    date: sast.getUTCDate(),
    day: sast.getUTCDay(),
    minutes: sast.getUTCHours() * 60 + sast.getUTCMinutes(),
  };
}

export function isShowLive(show: Show, at = new Date()): boolean {
  const schedule = parseSchedule(show);
  if (!schedule) return false;
  const local = sastDateParts(at);
  return (
    schedule.days.includes(local.day) &&
    local.minutes >= schedule.startMinutes &&
    local.minutes < schedule.endMinutes
  );
}

export function getLiveShows(
  lineup: readonly Show[],
  at = new Date(),
): Show[] {
  return lineup.filter((show) => isShowLive(show, at));
}

export function getNextScheduledShow(
  lineup: readonly Show[],
  at = new Date(),
): { show: Show; startsAt: Date } | null {
  const local = sastDateParts(at);
  const sastMidnight = Date.UTC(local.year, local.month, local.date);
  let next: { show: Show; startsAt: Date } | null = null;

  for (const show of lineup) {
    const schedule = parseSchedule(show);
    if (!schedule) continue;

    for (let offset = 0; offset <= 7; offset++) {
      const day = new Date(sastMidnight + offset * 24 * 60 * 60 * 1000);
      if (!schedule.days.includes(day.getUTCDay())) continue;
      const startsAt = new Date(
        sastMidnight +
          offset * 24 * 60 * 60 * 1000 +
          schedule.startMinutes * 60 * 1000 -
          SAST_OFFSET_MS,
      );
      if (startsAt.getTime() <= at.getTime()) continue;
      if (!next || startsAt.getTime() < next.startsAt.getTime()) {
        next = { show, startsAt };
      }
      break;
    }
  }
  return next;
}
