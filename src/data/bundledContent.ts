import { shows } from "@/data/shows";
import type { AppContent } from "@/types/content";

/** Explicit bundled fallback for rollback and unconfigured checkouts. */
export const bundledContent: AppContent = {
  shows, presenters: [], announcements: [],
  banners: shows.flatMap(show => show.poster ? [{ id: `bundled-${show.id}`, title: show.title, subtitle: show.subtitle,
    image: show.poster, showId: show.id, linkUrl: null, placement: "home_spotlight" as const, startsAt: null, endsAt: null }] : []),
};
