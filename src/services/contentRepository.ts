import { z } from "zod";
import { getSupabaseClient } from "@/services/supabase";
import { contentConfig } from "@/config/content";
import type { AppContent } from "@/types/content";
import type { ShowSchedule } from "@/types/show";
import { formatShowSchedule } from "@/utils/showSchedule";
import { publicSnapshotEnabled, readPublicSnapshot } from "@/services/publicSnapshot";

const id = z.string().min(1).max(200);
const nullableText = z.string().nullable();
const httpsUrl = z.url().refine(value => value.startsWith("https://"));
const windowFields = { starts_at: z.iso.datetime({ offset: true }).nullable(), ends_at: z.iso.datetime({ offset: true }).nullable() };
const mediaSchema = z.object({
  id, bucket_id: z.enum(["show-artwork","presenter-photos","banners","station-media"]),
  object_path: z.string().min(1).refine(value => !value.startsWith("/") && !value.split("/").includes("..")),
  width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
  // Optional for deployed v3 responses and old persisted offline catalogues.
  // A malformed optional delivery URL must not hide the station catalogue.
  public_url: httpsUrl.refine(value => !/^https:\/\/[^/]*@/.test(value)).nullable().optional().catch(null),
});
export const contentPayloadSchema = z.object({
  // Older persisted catalogues remain usable offline. Zod strips their obsolete
  // station/About fields; current screens obtain these from local files.
  version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  shows: z.array(z.object({ id, title: z.string().min(1), subtitle: nullableText, description: nullableText,
    artwork_id: nullableText, poster_id: nullableText, accent: z.string().regex(/^#[0-9a-f]{6}$/i), display_order: z.number().int(),
  })),
  presenters: z.array(z.object({ id, name: z.string().min(1), bio: nullableText, photo_id: nullableText })),
  show_presenters: z.array(z.object({ show_id: id, presenter_id: id, position: z.number().int().nonnegative() })),
  show_schedules: z.array(z.object({ id, show_id: id, day_of_week: z.number().int().min(0).max(6),
    starts_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/), ends_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/),
    timezone: z.literal("Africa/Johannesburg"), valid_from: z.iso.date().nullable(), valid_until: z.iso.date().nullable(),
  })),
  media_assets: z.array(mediaSchema),
  banners: z.array(z.object({ id, show_id: nullableText, title: z.string().min(1), subtitle: nullableText,
    image_id: id, placement: z.enum(["home_spotlight","home_banner"]), link_url: httpsUrl.nullable(), ...windowFields,
  })),
  announcements: z.array(z.object({ id, title: z.string().min(1), body: z.string().min(1), link_url: httpsUrl.nullable(), image_url: httpsUrl.refine(value => !/^https:\/\/[^/]*@/.test(value)).nullable().optional().catch(null), priority: z.number().int().default(0), ...windowFields })),
});
export type ContentPayload = z.infer<typeof contentPayloadSchema>;

export const emptyContent: AppContent = { shows: [], presenters: [], banners: [], announcements: [] };

export function decodeContent(value: unknown, baseUrl: string): AppContent {
  // Validate cached payloads as well as live responses before rendering them.
  const data = contentPayloadSchema.parse(value);
  const media = new Map(data.media_assets.filter(asset => asset.public_url).map(asset => [asset.id, {
    uri: asset.public_url!,
    ...(asset.width && asset.height ? { width: asset.width, height: asset.height } : {}),
  }]));
  const image = (assetId: string | null) => assetId ? media.get(assetId) : undefined;
  const presenters = data.presenters.map(presenter => ({ id: presenter.id, name: presenter.name, bio: presenter.bio, photo: image(presenter.photo_id) }));
  const presenterNames = new Map(presenters.map(presenter => [presenter.id, presenter.name]));
  return {
    shows: data.shows.map(show => {
      const schedules: ShowSchedule[] = data.show_schedules.filter(schedule => schedule.show_id === show.id).map(schedule => ({
        day: schedule.day_of_week, start: schedule.starts_at.slice(0,5), end: schedule.ends_at.slice(0,5),
        validFrom: schedule.valid_from, validUntil: schedule.valid_until,
      }));
      const formatted = formatShowSchedule(schedules);
      return { id: show.id, title: show.title, subtitle: show.subtitle ?? "", detail: show.description ?? "",
        presenterIds: data.show_presenters.filter(link => link.show_id === show.id).sort((a,b) => a.position - b.position).map(link => link.presenter_id),
        presenter: data.show_presenters.filter(link => link.show_id === show.id).sort((a,b) => a.position - b.position).map(link => presenterNames.get(link.presenter_id)).filter(Boolean).join(" & "),
        schedules, ...formatted, image: image(show.artwork_id), poster: image(show.poster_id), accent: show.accent,
      };
    }),
    presenters,
    banners: data.banners.flatMap(banner => {
      const artwork = image(banner.image_id);
      return artwork ? [{ id: banner.id, title: banner.title, subtitle: banner.subtitle, showId: banner.show_id,
        image: artwork, placement: banner.placement, linkUrl: banner.link_url, startsAt: banner.starts_at, endsAt: banner.ends_at }] : [];
    }),
    announcements: data.announcements.map(item => ({ id: item.id, title: item.title, body: item.body, linkUrl: item.link_url, imageUrl: item.image_url ?? null, priority: item.priority, startsAt: item.starts_at, endsAt: item.ends_at })).sort((a,b) => b.priority - a.priority),
  };
}

export function isContentInWindow(item: { startsAt: string | null; endsAt: string | null }, now: number) {
  return (!item.startsAt || Date.parse(item.startsAt) <= now) && (!item.endsAt || Date.parse(item.endsAt) > now);
}

export async function fetchAppContent(signal: AbortSignal): Promise<ContentPayload> {
  if (publicSnapshotEnabled()) return contentPayloadSchema.parse((await readPublicSnapshot(signal)).app);
  const request = new AbortController();
  const abort = () => request.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const { data, error } = await getSupabaseClient().rpc("get_app_content_v3").abortSignal(request.signal);
    if (error) throw new Error("Unable to update station content.");
    return contentPayloadSchema.parse(data);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
// Keep the compatible cache namespace so existing offline catalogues survive the upgrade.
export const contentQueryKey = ["app-content", 1, contentConfig.source, contentConfig.url] as const;
