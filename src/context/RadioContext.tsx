import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Asset } from "expo-asset";
import { shows } from "@/data/shows";
import {
  createStationStreamShow,
  STATION_STREAM_SHOW_ID,
} from "@/data/stationShow";
import type { Show } from "@/types/show";
import {
  selectAdjacentLiveShow,
  selectLiveShow,
  selectShow,
} from "@/utils/radio";
import { getLiveShows } from "@/utils/showSchedule";
import { useRadioPlayback } from "@/hooks/useRadioPlayback";

type RadioContextValue = {
  playing: boolean;
  hasPlayed: boolean;
  buffering: boolean;
  currentShow: Show | null;
  liveShows: Show[];
  listenerCount: number;
  liveShowCount: number;
  error: string | null;
  toggle: () => void;
  stop: () => void;
  clearCurrentShow: () => void;
  retry: () => void;
  listenLive: (showId?: string) => void;
  previous: () => void;
  next: () => void;
  sleepMinutes: number | null;
  setSleepTimer: (minutes: number | null) => void;
};

const RadioContext = createContext<RadioContextValue | null>(null);

/** Actual station audio with local preview show metadata and listener counts. */
export function RadioProvider({ children }: PropsWithChildren) {
  const [stationStreamShow] = useState(() => createStationStreamShow());
  const [currentShow, setCurrentShow] = useState<Show | null>(null);
  const [hasEverPlayed, setHasEverPlayed] = useState(false);
  const [liveShows, setLiveShows] = useState(() => getLiveShows(shows));
  const selectedShow = useRef<Show | null>(null);
  const { playback, status } = useRadioPlayback();
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalListeners = liveShows.reduce(
    (total, show) => total + (show.listeners ?? 0),
    0,
  );

  useEffect(() => {
    const updateLiveShows = () => setLiveShows(getLiveShows(shows));
    const interval = setInterval(updateLiveShows, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status.phase === "playing") setHasEverPlayed(true);
  }, [status.phase]);

  const startShow = useCallback(
    (show: Show | null, restart = false) => {
      if (!show) return;
      selectedShow.current = show;
      setCurrentShow(show);
      const artwork = show.image ?? show.poster;
      const artworkUrl =
        typeof artwork === "number"
          ? Asset.fromModule(artwork).uri
          : Array.isArray(artwork)
            ? artwork[0]?.uri
            : artwork?.uri;
      playback.start(
        {
          title: show.title,
          artist: show.presenter,
          artworkUrl,
        },
        restart,
      );
    },
    [playback],
  );

  const stop = playback.pause;
  const clearCurrentShow = useCallback(() => {
    selectedShow.current = null;
    setCurrentShow(null);
  }, []);
  const listenLive = useCallback(
    (showId?: string) => {
      const preferredId = showId ?? selectedShow.current?.id;
      if (preferredId === STATION_STREAM_SHOW_ID && selectedShow.current) {
        startShow(selectedShow.current);
        return;
      }
      if (preferredId) {
        startShow(selectShow(shows, preferredId));
        return;
      }
      startShow(selectLiveShow(shows) ?? stationStreamShow);
    },
    [startShow, stationStreamShow],
  );
  const previous = useCallback(
    () =>
      startShow(selectAdjacentLiveShow(shows, selectedShow.current?.id, -1)),
    [startShow],
  );
  const next = useCallback(
    () => startShow(selectAdjacentLiveShow(shows, selectedShow.current?.id, 1)),
    [startShow],
  );
  const toggle = useCallback(() => {
    const phase = playback.getSnapshot().phase;
    if (phase === "playing" || phase === "loading") stop();
    else listenLive();
  }, [playback, stop, listenLive]);
  const retry = useCallback(() => {
    const selected =
      selectedShow.current ?? selectLiveShow(shows) ?? stationStreamShow;
    startShow(selected, true);
  }, [startShow, stationStreamShow]);

  const setSleepTimer = useCallback(
    (minutes: number | null) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const duration =
        minutes !== null && Number.isFinite(minutes) && minutes > 0
          ? minutes
          : null;
      setSleepMinutes(duration);
      if (duration !== null) {
        timer.current = setTimeout(
          () => {
            stop();
            setSleepMinutes(null);
            timer.current = null;
          },
          duration * 60 * 1000,
        );
      }
    },
    [stop],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo<RadioContextValue>(
    () => ({
      playing: status.phase === "playing",
      hasPlayed: hasEverPlayed || status.phase === "playing",
      buffering: status.phase === "loading",
      currentShow,
      liveShows,
      listenerCount:
        currentShow?.listeners || totalListeners || stationStreamShow.listeners!,
      liveShowCount: liveShows.length,
      error: status.error,
      toggle,
      stop,
      clearCurrentShow,
      retry,
      listenLive,
      previous,
      next,
      sleepMinutes,
      setSleepTimer,
    }),
    [
      status,
      hasEverPlayed,
      currentShow,
      liveShows,
      stationStreamShow,
      toggle,
      stop,
      clearCurrentShow,
      retry,
      listenLive,
      previous,
      next,
      sleepMinutes,
      setSleepTimer,
    ],
  );

  return (
    <RadioContext.Provider value={value}>{children}</RadioContext.Provider>
  );
}

export function useRadio() {
  const context = useContext(RadioContext);
  if (!context) throw new Error("useRadio must be used inside RadioProvider");
  return context;
}
