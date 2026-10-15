export type PlaybackPhase = "idle" | "loading" | "playing" | "paused" | "error";
export type PlaybackSnapshot = { phase: PlaybackPhase; error: string | null };
export type StreamMetadata = {
  title: string;
  artist: string;
  artworkUrl?: string;
  canSkip?: boolean;
};
export type PlaybackUpdate = {
  phase: Exclude<PlaybackPhase, "idle">;
  error?: string;
};

export type RadioTransport = {
  play: () => void | Promise<void>;
  pause?: () => void;
  setMetadata: (metadata: StreamMetadata) => void;
  dispose: () => void;
};
export type RadioTransportFactory = (
  url: string,
  metadata: StreamMetadata,
  onStatus: (status: PlaybackUpdate) => void,
  onSkip: (direction: 1 | -1) => void,
) => RadioTransport;

export const STREAM_ERROR_MESSAGE =
  "Unable to connect to AceRadio. Check your connection and try again.";
export const STREAM_CONNECT_TIMEOUT_MS = 25000;
const initialSnapshot: PlaybackSnapshot = { phase: "idle", error: null };

/** One station connection; changing mock show metadata never restarts audible playback. */
export class RadioPlayback {
  private snapshot = initialSnapshot;
  private listeners = new Set<() => void>();
  private transport: RadioTransport | null = null;
  private generation = 0;
  private playRequest = 0;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private onSkip: ((direction: 1 | -1) => void) | null = null;

  constructor(
    private readonly url: string,
    private readonly createTransport: RadioTransportFactory,
    private readonly connectTimeout = STREAM_CONNECT_TIMEOUT_MS,
  ) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setSkipHandler(handler: ((direction: 1 | -1) => void) | null) {
    this.onSkip = handler;
  }

  setMetadata(metadata: StreamMetadata) {
    try {
      this.transport?.setMetadata(metadata);
    } catch {
      // Artwork and system metadata must not interrupt the broadcast.
    }
  }

  start(metadata: StreamMetadata, restart = false) {
    if (
      !restart &&
      this.transport &&
      (this.snapshot.phase === "playing" || this.snapshot.phase === "loading")
    ) {
      // Optional system metadata must never interrupt the actual station audio.
      try {
        this.transport.setMetadata(metadata);
      } catch {
        /* Media controls may be unavailable. */
      }
      return;
    }

    // Native pause keeps its media session so the listener can resume remotely.
    if (!restart && this.transport?.pause && this.snapshot.phase === "paused") {
      this.setMetadata(metadata);
      const generation = this.generation;
      this.update({ phase: "loading", error: null });
      this.startTimeout(generation);
      this.playTransport(generation);
      return;
    }

    this.release();
    const generation = this.generation;
    this.update({ phase: "loading", error: null });
    this.startTimeout(generation);
    try {
      this.transport = this.createTransport(this.url, metadata, (status) => {
        if (generation !== this.generation) return;
        if (status.phase === "error") {
          this.fail(generation, status.error);
          return;
        }
        this.update({ phase: status.phase, error: null });
        if (status.phase === "loading") this.startTimeout(generation);
        else this.clearTimeout();
      }, (direction) => {
        if (generation === this.generation) this.onSkip?.(direction);
      });
      // Invoke synchronously: browser playback must begin within the user's tap.
      this.playTransport(generation);
    } catch {
      this.fail(generation);
    }
  }

  pause = () => {
    this.playRequest++;
    const phase = this.snapshot.phase === "idle" ? "idle" : "paused";
    this.clearTimeout();
    try {
      if (this.transport?.pause) this.transport.pause();
      else this.release();
    } catch {
      this.release();
    }
    this.update({ phase, error: null });
  };

  stop = () => {
    this.release();
    this.update({ phase: "paused", error: null });
  };

  dispose = () => {
    this.release();
    this.update(initialSnapshot);
  };

  private fail(generation: number, error = STREAM_ERROR_MESSAGE) {
    if (generation !== this.generation) return;
    this.release();
    this.update({ phase: "error", error });
  }

  private playTransport(generation: number) {
    const request = ++this.playRequest;
    const fail = () => {
      if (request === this.playRequest) this.fail(generation);
    };
    try {
      const playback = this.transport?.play();
      if (playback) playback.catch(fail);
    } catch {
      fail();
    }
  }

  private update(next: PlaybackSnapshot) {
    if (
      this.snapshot.phase === next.phase &&
      this.snapshot.error === next.error
    )
      return;
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private startTimeout(generation: number) {
    // Repeated buffering/status events must not extend a stalled connection forever.
    if (this.timeout) return;
    this.timeout = setTimeout(() => {
      this.timeout = null;
      this.fail(
        generation,
        "The stream is taking too long to connect. Check your connection and try again.",
      );
    }, this.connectTimeout);
  }

  private clearTimeout() {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private release() {
    this.generation++;
    this.playRequest++;
    this.clearTimeout();
    const transport = this.transport;
    this.transport = null;
    try {
      transport?.dispose();
    } catch {
      /* An already-released native player is safe to discard. */
    }
  }
}
