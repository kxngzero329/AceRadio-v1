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
} from "react-native";
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

export function MiniPlayer() {
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
      style={[styles.row, { opacity, transform: [{ translateX }] }]}
    >
      <Pressable
        disabled={clearing}
        onPress={() => router.navigate("/player")}
        accessibilityRole="button"
        accessibilityLabel="Open live radio player"
        style={styles.info}
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
            <Text style={styles.title} numberOfLines={1}>
              {displayedShow?.title ?? "AceRadio Live"}
            </Text>
            <Text style={[styles.sub, error && styles.error]} numberOfLines={1}>
              {error
                ? "Connection interrupted · Tap for details"
                : buffering
                  ? "Tuning in…"
                  : displayedShow
                    ? displayedShow.id === "aceradio-live-stream"
                      ? "Streaming from AceRadio"
                      : displayedShow.presenter
                    : "Your music, your moment"}
            </Text>
          </View>
        </Animated.View>
        <ChevronUp size={14} color={colors.muted} />
      </Pressable>
      <View style={styles.controls}>
        <Pressable
          onPress={previous}
          disabled={!canSkip || clearing}
          accessibilityRole="button"
          accessibilityLabel="Previous live show"
          accessibilityState={{ disabled: !canSkip || clearing }}
          style={styles.skip}
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
          onPress={toggle}
          disabled={clearing}
          style={styles.play}
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
          style={styles.skip}
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
          style={styles.clear}
          hitSlop={6}
        >
          <X size={19} color={colors.muted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    bottom: 78,
    left: 14,
    right: 14,
    zIndex: 12,
    minHeight: 67,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A2A20",
    borderColor: "#335942",
    borderWidth: 1,
    padding: 8,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 13,
    elevation: 8,
  },
  info: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 49,
  },
  show: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  copy: { flex: 1, minWidth: 0 },
  art: { width: 42, height: 42, borderRadius: 11, backgroundColor: "#10321E" },
  title: { fontWeight: "800", fontSize: 13, color: colors.white },
  sub: { color: colors.muted, fontSize: 10, marginTop: 4 },
  error: { color: "#F4CDB7" },
  controls: { flexDirection: "row", alignItems: "center" },
  skip: {
    width: 44,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    height: 44,
    width: 44,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  clear: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
