import { isRunningInExpoGo } from "expo";
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioMetadata,
  type AudioStatus,
} from "expo-audio";
import {
  STREAM_ERROR_MESSAGE,
  type RadioTransportFactory,
  type StreamMetadata,
} from "@/utils/RadioPlayback";

const audioMetadata = (metadata: StreamMetadata): AudioMetadata => ({
  title: metadata.title,
  artist: metadata.artist,
  albumTitle: "AceRadio Live",
  artworkUrl: metadata.artworkUrl,
});

/** Native Expo Audio player, created only after the listener presses Play. */
export const createRadioTransport: RadioTransportFactory = (
  url,
  initialMetadata,
  onStatus,
) => {
  // Expo Go cannot receive this app's native playback-service configuration.
  // The ExpoGo module distinguishes it from our configured development client.
  const supportsBackgroundPlayback = !isRunningInExpoGo();
  const player = createAudioPlayer(null, {
    updateInterval: 1000,
    downloadFirst: false,
  });
  let disposed = false;
  let started = false;
  let hasPlayed = false;
  let metadata = initialMetadata;
  const lockScreenOptions = {
    showSeekForward: false,
    showSeekBackward: false,
    isLiveStream: true,
  };
  const activateLockScreen = () => {
    if (!supportsBackgroundPlayback) return;
    try {
      player.setActiveForLockScreen(
        true,
        audioMetadata(metadata),
        lockScreenOptions,
      );
    } catch {
      /* System media controls are optional; station audio can still play. */
    }
  };

  const subscription = player.addListener(
    "playbackStatusUpdate",
    (status: AudioStatus) => {
      if (disposed || !started) return;
      if (
        status.error ||
        status.playbackState === "failed" ||
        status.didJustFinish
      ) {
        onStatus({ phase: "error", error: STREAM_ERROR_MESSAGE });
      } else if (
        status.isBuffering ||
        !status.isLoaded ||
        status.timeControlStatus === "waiting"
      ) {
        onStatus({ phase: "loading" });
      } else if (status.playing) {
        hasPlayed = true;
        onStatus({ phase: "playing" });
      } else if (hasPlayed) {
        // Reflect OS/headphone interruptions and lock-screen pause in every player.
        onStatus({ phase: "paused" });
      }
    },
  );

  return {
    async play() {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: supportsBackgroundPlayback,
        interruptionMode: "doNotMix",
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      });
      if (disposed) return;
      started = true;
      player.replace({ uri: url });
      if (disposed) return;
      activateLockScreen();
      if (disposed) return;
      player.play();
    },
    setMetadata(nextMetadata) {
      metadata = nextMetadata;
      if (started && !disposed) activateLockScreen();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Explicit SharedObject release stops native buffering and its background service.
      for (const cleanup of [
        () => subscription.remove(),
        () => {
          if (supportsBackgroundPlayback) player.setActiveForLockScreen(false);
        },
        () => player.pause(),
        () => player.remove(),
        () => player.release(),
      ]) {
        try {
          cleanup();
        } catch {
          /* Continue cleanup even if the system released a player first. */
        }
      }
    },
  };
};
