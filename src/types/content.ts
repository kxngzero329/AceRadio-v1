import type { ImageSourcePropType } from "react-native";
import type { Show } from "@/types/show";

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  showId: string | null;
  image: ImageSourcePropType;
  linkUrl: string | null;
  placement: "home_spotlight" | "home_banner";
  startsAt: string | null;
  endsAt: string | null;
};
export type Announcement = {
  id: string; title: string; body: string; linkUrl: string | null;
  startsAt: string | null; endsAt: string | null;
};
export type Presenter = { id: string; name: string; bio: string | null; photo?: ImageSourcePropType };
export type AppContent = {
  shows: Show[]; presenters: Presenter[]; banners: Banner[]; announcements: Announcement[];
};
