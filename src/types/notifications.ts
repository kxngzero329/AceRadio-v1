export type ReminderScope = "favorites" | "all";
export type ReminderLead = 0 | 5 | 10 | 15;
export type OneTimeReminder = { showId: string; startsAt: string; leadMinutes: ReminderLead };
export type DevicePreferences = {
  consent: boolean;
  oneTime: OneTimeReminder[];
};
export type ShowReminder = {
  version: 1;
  kind: "show-reminder";
  showId: string;
  startsAt: string;
  endsAt: string;
};
const showId = /^[a-z0-9][a-z0-9-]{0,199}$/;
export function parseShowReminder(value: unknown): ShowReminder | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.version !== 1 || item.kind !== "show-reminder" ||
    typeof item.showId !== "string" || !showId.test(item.showId) ||
    typeof item.startsAt !== "string" || typeof item.endsAt !== "string") return null;
  const start = Date.parse(item.startsAt), end = Date.parse(item.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 86400_000) return null;
  return { version: 1, kind: "show-reminder", showId: item.showId, startsAt: item.startsAt, endsAt: item.endsAt };
}

export function reminderKey(item: Pick<ShowReminder, "showId" | "startsAt">) {
  return `${item.showId}:${new Date(item.startsAt).toISOString()}`;
}
