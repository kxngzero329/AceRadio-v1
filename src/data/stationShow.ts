import type { Show } from "@/types/show";

export const STATION_STREAM_SHOW_ID = "aceradio-live-stream";

export function createStationStreamShow(random: () => number = Math.random): Show {
  const value = Math.max(0, Math.min(random(), 1 - Number.EPSILON));
  return {
    id: STATION_STREAM_SHOW_ID,
    title: "AceRadio Live Broadcast",
    presenter: "AceRadio",
    subtitle: "Broadcasting live from the AceRadio stream.",
    schedule: "Streaming live",
    day: "Live",
    detail: "The AceRadio live station stream.",
    image: require("../../assets/icons/icon.png"),
    accent: "#1E1E1E",
    listeners: 50 + Math.floor(value * 1951),
  };
}
