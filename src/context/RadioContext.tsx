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
import { getRadioMetadata, resolveRadioArtwork } from "@/services/radioMetadata";
import { useContent } from "@/context/ContentContext";
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
  listenerCount: number | null;
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
  const { shows, source } = useContent();
  const lineup = useRef(shows);
  lineup.current = shows;
  const [stationStreamShow] = useState(() => createStationStreamShow());
  const [currentShow, setCurrentShow] = useState<Show | null>(null);
  const [hasEverPlayed, setHasEverPlayed] = useState(false);
  const [scheduleTime, setScheduleTime] = useState(() => new Date());
  const liveShows = useMemo(() => getLiveShows(shows, scheduleTime), [shows, scheduleTime]);
  const selectedShow = useRef<Show | null>(null);
  const { playback, status } = useRadioPlayback();
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalListeners = liveShows.reduce(
    (total, show) => total + (show.listeners ?? 0),
    0,
  );

  useEffect(() => {
    const updateLiveShows = () => setScheduleTime(new Date());
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
      playback.start(
        getRadioMetadata(show, getLiveShows(lineup.current).length > 1),
        restart,
      );
      // Native notifications need a file:// URL for artwork bundled in an APK.
      // Resolve it independently so listening still starts in the original tap.
      void resolveRadioArtwork(show)
        .then(() => {
          if (selectedShow.current !== show) return;
          playback.setMetadata(getRadioMetadata(show, getLiveShows(lineup.current).length > 1));
        })
        .catch(console.warn);
    },
    [playback],
  );

  const stop = playback.stop;
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
    [startShow, stationStreamShow, shows],
  );
  const previous = useCallback(
    () =>
      startShow(selectAdjacentLiveShow(shows, selectedShow.current?.id, -1)),
    [startShow, shows],
  );
  const next = useCallback(
    () => startShow(selectAdjacentLiveShow(shows, selectedShow.current?.id, 1)),
    [startShow, shows],
  );
  useEffect(() => {
    playback.setSkipHandler((direction) => direction === 1 ? next() : previous());
    return () => playback.setSkipHandler(null);
  }, [playback, next, previous]);

  useEffect(() => {
    const selected = selectedShow.current;
    const show = shows.find(item => item.id === selected?.id) ?? selected;
    if (!show) return;
    // A catalogue refresh can update artwork/text while the native stream keeps playing.
    selectedShow.current = show;
    setCurrentShow(show);
    playback.setMetadata(getRadioMetadata(show, liveShows.length > 1));
  }, [playback, liveShows, shows]);
  const toggle = useCallback(() => {
    const phase = playback.getSnapshot().phase;
    if (phase === "playing" || phase === "loading") playback.pause();
    else listenLive();
  }, [playback, listenLive]);
  const retry = useCallback(() => {
    const selected =
      selectedShow.current ?? selectLiveShow(shows) ?? stationStreamShow;
    startShow(selected, true);
  }, [startShow, stationStreamShow, shows]);

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
      listenerCount: source === "supabase" ? null :
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
      source,
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
