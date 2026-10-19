import { getShowOccurrence } from "@/utils/showSchedule";
import type { Show } from "@/types/show";
import type { ShowReminder } from "@/types/notifications";

export function notificationOpenAction(reminder: ShowReminder, shows: readonly Show[], now = Date.now()) {
  const show = shows.find(item => item.id === reminder.showId);
  if (!show) return { showId: null, play: false, preferredShow: undefined, message: "This show is no longer available. You can still listen to AceRadio live." };
  const occurrence = getShowOccurrence(show, reminder.startsAt);
  if (!occurrence || occurrence.endsAt.getTime() !== Date.parse(reminder.endsAt))
    return { showId: show.id, play: false, preferredShow: undefined, message: "This show's schedule has changed. Check its latest broadcast times below." };
  if (now >= occurrence.endsAt.getTime())
    return { showId: show.id, play: false, preferredShow: undefined, message: "This broadcast has ended. Check the show for its next scheduled time." };
  if (now < occurrence.startsAt.getTime() - 15 * 60_000)
    return { showId: show.id, play: false, preferredShow: undefined, message: "This show has not started yet. Check its scheduled time below." };
  if (now < occurrence.startsAt.getTime()) {
    const time = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(occurrence.startsAt);
    return { showId: show.id, play: true, preferredShow: undefined, message: `${show.title} starts at ${time} SAST. Playing AceRadio's current live broadcast until then.` };
  }
  return { showId: show.id, play: true, preferredShow: show.id, message: null };
}
