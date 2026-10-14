import { useEffect, useState, useSyncExternalStore } from "react";
import { STATION } from "@/config/station";
import { createRadioTransport } from "@/services/radioTransport";
import { RadioPlayback } from "@/utils/RadioPlayback";

export function useRadioPlayback() {
  // The constructor does not allocate audio or fetch the stream before Play.
  const [playback] = useState(
    () => new RadioPlayback(STATION.streamUrl, createRadioTransport),
  );
  const status = useSyncExternalStore(
    playback.subscribe,
    playback.getSnapshot,
    playback.getSnapshot,
  );
  useEffect(() => () => playback.dispose(), [playback]);
  return { playback, status };
}
