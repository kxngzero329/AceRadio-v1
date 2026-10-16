import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Image,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Play,
  Pause,
  ChevronUp,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react-native";
import { router } from "@/utils/navigation";
import { useRadio } from "@/context/RadioContext";
import { useShowTransition } from "@/hooks/useShowTransition";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { colors } from "@/theme/colors";
import { layout, stackedMiniPlayer, tabBarHeight } from "@/theme/layout";

export function MiniPlayer() {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const stacked = stackedMiniPlayer(width, fontScale);
  const horizontalInset = Math.max(12, (width - layout.contentWidth) / 2);
  const {
    playing,
    hasPlayed,
    buffering,
    currentShow,
    liveShowCount,
    error,
    toggle,
    stop,
    clearCurrentShow,
    previous,
    next,
  } = useRadio();
  const { displayedShow, fade } = useShowTransition(currentShow);
  const reducedMotion = useReducedMotion();
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef(false);
  const wasClearedRef = useRef(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const canSkip = liveShowCount > 1;

  useEffect(() => {
    if (!currentShow) {
      wasClearedRef.current = true;
      clearingRef.current = false;
      setClearing(false);
      opacity.setValue(0);
      translateX.setValue(24);
      return;
    }
    if (!hasPlayed || !wasClearedRef.current) return;

    wasClearedRef.current = false;
    clearingRef.current = false;
    setClearing(false);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: reducedMotion ? 0 : 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: reducedMotion ? 0 : 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();
  }, [currentShow, hasPlayed, opacity, reducedMotion, translateX]);

  if (!hasPlayed || !currentShow) return null;

  const clear = () => {
    if (clearingRef.current) return;
    clearingRef.current = true;
    setClearing(true);
    stop();
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: reducedMotion ? 0 : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(translateX, {
        toValue: 24,
        duration: reducedMotion ? 0 : 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(({ finished }) => {
      if (finished) clearCurrentShow();
    });
  };

  return (
    <Animated.View
      testID="mini-player"
      style={[
        styles.row,
        stacked && styles.stacked,
        {
          left: horizontalInset,
          right: horizontalInset,
          bottom: tabBarHeight(insets.bottom) + 8,
          opacity,
          transform: [{ translateX }],
        },
      ]}
    >
      <Pressable
        disabled={clearing}
        onPress={() => router.navigate("/player")}
        accessibilityRole="button"
        accessibilityLabel="Open live radio player"
        accessibilityState={{ disabled: clearing }}
        style={({ pressed }) => [
          styles.info,
          stacked && styles.stackedInfo,
          pressed && styles.pressed,
        ]}
      >
        <Animated.View style={[styles.show, { opacity: fade }]}>
          <Image
            source={
              displayedShow?.image ?? require("../../assets/icons/icon.png")
            }
            style={styles.art}
            resizeMode={displayedShow ? "cover" : "contain"}
            accessibilityLabel={displayedShow?.presenter ?? "AceRadio"}
          />
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={stacked ? 2 : 1}>
              {displayedShow?.title ?? "AceRadio Live"}
            </Text>
            <Text style={[styles.sub, error && styles.error]} numberOfLines={1}>
              {error
                ? "Connection interrupted · Tap for details"
                : buffering
                  ? "Tuning in…"
                  : `${!playing && !stacked ? "Paused · " : ""}${displayedShow?.id === "aceradio-live-stream" ? "Streaming from AceRadio" : (displayedShow?.presenter ?? "Your music, your moment")}`}
            </Text>
          </View>
        </Animated.View>
        <ChevronUp size={14} color={colors.muted} />
      </Pressable>
      <View style={[styles.controls, stacked && styles.stackedControls]}>
        {stacked && (
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                playing && !buffering && !error && styles.statusLive,
                error && styles.statusError,
              ]}
            />
            <Text style={styles.statusText} numberOfLines={1}>
              {error
                ? "Interrupted"
                : buffering
                  ? "Connecting"
                  : playing
                    ? "Live"
                    : "Paused"}
            </Text>
          </View>
        )}
        <View style={styles.buttons}>
          <Pressable
            onPress={previous}
            disabled={!canSkip || clearing}
            accessibilityRole="button"
            accessibilityLabel="Previous live show"
            accessibilityState={{ disabled: !canSkip || clearing }}
            style={({ pressed }) => [
              styles.skip,
              (!canSkip || clearing) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <SkipBack
              size={19}
              color={canSkip ? colors.white : colors.subtle}
              fill={canSkip ? colors.white : colors.subtle}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              buffering
                ? "Cancel loading live show"
                : playing
                  ? "Pause live radio"
                  : "Play live radio"
            }
            accessibilityState={{ busy: buffering, disabled: clearing }}
            aria-busy={buffering}
            onPress={toggle}
            disabled={clearing}
            style={({ pressed }) => [
              styles.play,
              clearing && styles.disabled,
              pressed && styles.playPressed,
            ]}
          >
            {buffering ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : playing ? (
              <Pause
                color={colors.background}
                size={20}
                fill={colors.background}
              />
            ) : (
              <Play
                color={colors.background}
                size={21}
                fill={colors.background}
              />
            )}
          </Pressable>
          <Pressable
            onPress={next}
            disabled={!canSkip || clearing}
            accessibilityRole="button"
            accessibilityLabel="Next live show"
            accessibilityState={{ disabled: !canSkip || clearing }}
            style={({ pressed }) => [
              styles.skip,
              (!canSkip || clearing) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <SkipForward
              size={19}
              color={canSkip ? colors.white : colors.subtle}
              fill={canSkip ? colors.white : colors.subtle}
            />
          </Pressable>
          <Pressable
            onPress={clear}
            disabled={clearing}
            accessibilityRole="button"
            accessibilityLabel="Stop playback and dismiss player"
            accessibilityState={{ disabled: clearing }}
            style={({ pressed }) => [
              styles.clear,
              clearing && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <X size={19} color={colors.muted} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    zIndex: 12,
    minHeight: 67,
    borderRadius: layout.cardRadius,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 8,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  stacked: { flexDirection: "column", alignItems: "stretch", gap: 4 },
  stackedInfo: { flex: 0, width: "100%", paddingHorizontal: 2 },
  info: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 49,
    borderRadius: 10,
  },
  show: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copy: { flex: 1, minWidth: 0 },
  art: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.greenDeep,
  },
  title: {
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 19,
    color: colors.white,
  },
  sub: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  error: { color: "#F4CDB7" },
  controls: { flexDirection: "row", alignItems: "center" },
  stackedControls: { width: "100%", justifyContent: "space-between" },
  buttons: { flexDirection: "row", alignItems: "center" },
  statusRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 6,
    paddingRight: 8,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.subtle,
  },
  statusLive: { backgroundColor: colors.green },
  statusError: { backgroundColor: colors.red },
  statusText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    flexShrink: 1,
  },
  pressed: { backgroundColor: colors.border },
  playPressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  skip: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    height: 44,
    width: 44,
    borderRadius: layout.controlRadius,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  clear: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
  },
});
