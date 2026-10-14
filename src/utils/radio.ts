import type { Show } from "@/types/show";
import { getLiveShows, getNextScheduledShow } from "@/utils/showSchedule";

export function selectLiveShow(
  lineup: readonly Show[],
  preferredId?: string,
  random: () => number = Math.random,
  at = new Date(),
): Show | null {
  const live = getLiveShows(lineup, at);
  const preferred = live.find((show) => show.id === preferredId);
  if (preferred) return preferred;
  if (!live.length) return null;
  const index = Math.max(
    0,
    Math.min(live.length - 1, Math.floor(random() * live.length)),
  );
  return live[index];
}

/** Every show uses the same station stream; explicit selections retain that show's preview details. */
export function selectShow(
  lineup: readonly Show[],
  preferredId?: string,
  at = new Date(),
): Show | null {
  return (
    lineup.find((show) => show.id === preferredId) ??
    selectLiveShow(lineup, undefined, Math.random, at) ??
    getNextScheduledShow(lineup, at)?.show ??
    lineup[0] ??
    null
  );
}

/** Previous/next cycle through currently scheduled shows and wrap at either end. */
export function selectAdjacentLiveShow(
  lineup: readonly Show[],
  currentId: string | undefined,
  direction: 1 | -1,
  at = new Date(),
): Show | null {
  const live = getLiveShows(lineup, at);
  if (!live.length) return null;
  const current = live.findIndex((show) => show.id === currentId);
  if (current < 0) return direction === 1 ? live[0] : live[live.length - 1];
  return live[(current + direction + live.length) % live.length];
}
