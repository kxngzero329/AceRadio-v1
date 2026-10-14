import {
  STREAM_ERROR_MESSAGE,
  type RadioTransportFactory,
  type StreamMetadata,
} from "@/utils/RadioPlayback";

/** Use media events and the play promise directly for accurate browser buffering/errors. */
export const createRadioTransport: RadioTransportFactory = (
  url,
  initialMetadata,
  onStatus,
) => {
  const audio = new Audio();
  audio.preload = "none";
  audio.src = url;
  let disposed = false;
  let metadata = initialMetadata;
  const handlers: [keyof HTMLMediaElementEventMap, EventListener][] = [];
  const mediaSession =
    typeof navigator !== "undefined" ? navigator.mediaSession : undefined;

  const mediaState = (state: MediaSessionPlaybackState) => {
    try {
      if (mediaSession) mediaSession.playbackState = state;
    } catch {
      /* System media controls are optional. */
    }
  };
  const mediaAction = (
    action: MediaSessionAction,
    handler: MediaSessionActionHandler | null,
  ) => {
    try {
      mediaSession?.setActionHandler(action, handler);
    } catch {
      /* Older browsers may not implement every media-session action. */
    }
  };
  const listen = (
    event: keyof HTMLMediaElementEventMap,
    handler: () => void,
  ) => {
    const guarded = () => {
      if (!disposed) handler();
    };
    audio.addEventListener(event, guarded);
    handlers.push([event, guarded]);
  };
  const updateMetadata = (nextMetadata: StreamMetadata) => {
    metadata = nextMetadata;
    if (mediaSession && typeof MediaMetadata !== "undefined") {
      try {
        mediaSession.metadata = new MediaMetadata({
          title: metadata.title,
          artist: metadata.artist,
          album: "AceRadio Live",
          artwork: metadata.artworkUrl ? [{ src: metadata.artworkUrl }] : [],
        });
      } catch {
        /* A rejected artwork URI must not prevent listening. */
      }
    }
  };
  const play = () =>
    audio.play().catch((error: unknown) => {
      if (disposed) return;
      const blocked =
        error instanceof DOMException && error.name === "NotAllowedError";
      onStatus({
        phase: "error",
        error: blocked
          ? "Tap Play to start the AceRadio stream."
          : STREAM_ERROR_MESSAGE,
      });
    });

  listen("playing", () => {
    mediaState("playing");
    onStatus({ phase: "playing" });
  });
  listen("waiting", () => onStatus({ phase: "loading" }));
  listen("pause", () => {
    mediaState("paused");
    onStatus({ phase: "paused" });
  });
  listen("error", () =>
    onStatus({ phase: "error", error: STREAM_ERROR_MESSAGE }),
  );
  listen("ended", () =>
    onStatus({
      phase: "error",
      error: "The live stream stopped. Tap Retry to reconnect.",
    }),
  );

  updateMetadata(metadata);
  if (mediaSession) {
    mediaAction("play", () => {
      void play();
    });
    mediaAction("pause", () => audio.pause());
  }

  return {
    play,
    setMetadata: updateMetadata,
    dispose() {
      if (disposed) return;
      disposed = true;
      handlers.forEach(([event, handler]) =>
        audio.removeEventListener(event, handler),
      );
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (mediaSession) {
        mediaAction("play", null);
        mediaAction("pause", null);
        try {
          mediaSession.metadata = null;
        } catch {
          /* Optional system controls. */
        }
        mediaState("none");
      }
    },
  };
};
