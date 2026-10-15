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
  onSkip,
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
  let paused = false;
  let operation = 0;
  let lockScreenActive = false;
  let metadata = initialMetadata;
  // Android decodes this field as java.net.URL. Packaged asset:/ URIs reject
  // the entire native call, so show text controls while artwork is resolved.
  const safeMetadata = () => audioMetadata({
    ...metadata,
    artworkUrl: /^(https?|file):\/\//i.test(metadata.artworkUrl ?? "")
      ? metadata.artworkUrl
      : undefined,
  });
  const activateLockScreen = () => {
    if (!supportsBackgroundPlayback) return;
    try {
      const options = {
        showSeekForward: false,
        showSeekBackward: false,
        isLiveStream: true,
        showNextTrack: metadata.canSkip ?? false,
        showPreviousTrack: metadata.canSkip ?? false,
      };
      if (lockScreenActive) player.updateLockScreenMetadata(safeMetadata());
      else {
        player.setActiveForLockScreen(true, safeMetadata(), options);
        lockScreenActive = true;
      }
    } catch (error) {
      console.warn("AceRadio could not activate system media controls", error);
    }
  };

  const subscription = player.addListener(
    "playbackStatusUpdate",
    (status: AudioStatus) => {
      if (disposed || !started) return;
      if (paused) {
        // A native remote Play can resume while the React view is backgrounded.
        if (status.playing || status.timeControlStatus === "waiting") paused = false;
        else return;
      }
      if (
        status.error ||
        status.playbackState === "failed" ||
        status.didJustFinish
      ) {
        onStatus({ phase: "error", error: STREAM_ERROR_MESSAGE });
      } else if (
        status.isBuffering && !status.playing && status.timeControlStatus === "paused"
      ) {
        onStatus({ phase: "paused" });
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
  const remoteSubscription = supportsBackgroundPlayback
    ? player.addListener("remoteTrackChange", ({ direction }) => {
        if (!disposed && metadata.canSkip) onSkip(direction);
      })
    : null;

  return {
    async play() {
      const request = ++operation;
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: supportsBackgroundPlayback,
        interruptionMode: "doNotMix",
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      });
      if (disposed || request !== operation) return;
      paused = false;
      started = true;
      player.replace({ uri: url });
      if (disposed) return;
      activateLockScreen();
      if (disposed) return;
      player.play();
    },
    pause() {
      operation++;
      paused = true;
      player.pause();
      onStatus({ phase: "paused" });
    },
    setMetadata(nextMetadata) {
      const controlsChanged = metadata.canSkip !== nextMetadata.canSkip;
      metadata = nextMetadata;
      // Reconfigure only when commands change; artwork/text updates reuse the session.
      if (controlsChanged) lockScreenActive = false;
      if (started && !disposed) activateLockScreen();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      operation++;
      // Explicit SharedObject release stops native buffering and its background service.
      for (const cleanup of [
        () => subscription.remove(),
        () => remoteSubscription?.remove(),
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
