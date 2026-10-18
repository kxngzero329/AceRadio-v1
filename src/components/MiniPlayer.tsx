import { fonts } from "@/theme/fonts";
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
  X,
} from "lucide-react-native";
import { router } from "@/utils/navigation";
import { useRadio } from "@/context/RadioContext";
import { useShowTransition } from "@/hooks/useShowTransition";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { colors } from "@/theme/colors";
import { layout, miniPlayerHeight, tabBarHeight } from "@/theme/layout";
import { STATION_STREAM_SHOW_ID } from "@/data/stationShow";
import { motion } from "@/theme/motion";
import { PlaybackButton } from "@/components/PlaybackButton";

export function MiniPlayer() {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const showArtwork = width >= 360 && fontScale <= 1.3;
  const horizontalInset = Math.max(12, (width - layout.contentWidth) / 2);
  const {
    playing,
    hasPlayed,
    buffering,
    currentShow,
    error,
    toggle,
    stop,
    clearCurrentShow,
  } = useRadio();
  const { displayedShow, fade } = useShowTransition(currentShow);
  const reducedMotion = useReducedMotion();
  const [clearing, setClearing] = useState(false);
  const clearingRef = useRef(false);
  const wasClearedRef = useRef(true);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const latestShow = useRef(currentShow);
  latestShow.current = currentShow;

  useEffect(() => () => animation.current?.stop(), []);

  useEffect(() => {
    if (!currentShow) {
      animation.current?.stop();
      wasClearedRef.current = true;
      clearingRef.current = false;
      setClearing(false);
      opacity.setValue(0);
      translateY.setValue(8);
      return;
    }
    // A fresh Play during dismissal takes ownership; an old exit must not
    // clear a newly selected stream when its completion callback runs.
    if (clearingRef.current && (playing || buffering)) {
      animation.current?.stop();
      wasClearedRef.current = true;
      clearingRef.current = false;
      setClearing(false);
    }
    if (reducedMotion) {
      animation.current?.stop();
      if (clearingRef.current) {
        clearCurrentShow();
        return;
      }
      opacity.setValue(1);
      translateY.setValue(0);
      if (hasPlayed) wasClearedRef.current = false;
      return;
    }
    if (!hasPlayed || !wasClearedRef.current) return;

    wasClearedRef.current = false;
    clearingRef.current = false;
    setClearing(false);
    animation.current?.stop();
    animation.current = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.miniIn,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.miniIn,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      }),
    ]);
    animation.current.start();
  }, [buffering, clearCurrentShow, currentShow, hasPlayed, opacity, playing, reducedMotion, translateY]);

  if (!hasPlayed || !currentShow) return null;

  const stationStream = displayedShow?.id === STATION_STREAM_SHOW_ID;
  const title = stationStream ? "AceRadio Live" : displayedShow?.title ?? "AceRadio Live";
  const status = error ? "Connection interrupted" : buffering ? "Connecting…" : !playing
    ? "Paused" : stationStream ? "Live radio" : `Live · ${displayedShow?.presenter ?? "AceRadio"}`;

  const clear = () => {
    if (clearingRef.current) return;
    clearingRef.current = true;
    setClearing(true);
    stop();
    animation.current?.stop();
    animation.current = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: reducedMotion ? 0 : motion.miniOut,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      }),
      Animated.timing(translateY, {
        toValue: 8,
        duration: reducedMotion ? 0 : motion.miniOut,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      }),
    ]);
    animation.current.start(({ finished }) => {
      if (finished && clearingRef.current && latestShow.current?.id === currentShow.id) clearCurrentShow();
    });
  };

  return (
    <Animated.View
      testID="mini-player"
      style={[
        styles.row,
        {
          minHeight: miniPlayerHeight(fontScale),
          left: horizontalInset,
          right: horizontalInset,
          bottom: tabBarHeight(insets.bottom) + 8,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable
        disabled={clearing}
        onPress={() => router.navigate("/player")}
        accessibilityRole="button"
        accessibilityLabel="Open live radio player"
        accessibilityHint={`${title}. ${status}. Opens the full player.`}
        accessibilityState={{ disabled: clearing }}
        style={({ pressed }) => [
          styles.info,
          pressed && styles.pressed,
        ]}
      >
        <Animated.View style={[styles.show, { opacity: fade }]}>
          {showArtwork && <Image
            source={
              displayedShow?.image ?? require("../../assets/icons/icon.png")
            }
            style={styles.art}
            resizeMode={displayedShow ? "cover" : "contain"}
            accessibilityLabel={displayedShow?.presenter ?? "AceRadio"}
          />}
          <View style={styles.copy}>
            <Text style={styles.title} numberOfLines={fontScale > 1.3 ? 2 : 1}>
              {title}
            </Text>
            <Text style={[styles.sub, error && styles.error]} numberOfLines={1}>
              {status}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
      <View style={styles.controls}>
          <PlaybackButton
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
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : playing ? (
              <Pause
                color={colors.onAccent}
                size={20}
                fill={colors.onAccent}
              />
            ) : (
              <Play
                color={colors.onAccent}
                size={21}
                fill={colors.onAccent}
              />
            )}
          </PlaybackButton>
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: "absolute",
    zIndex: 12,
    minHeight: 62,
    borderRadius: layout.cardRadius,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderWidth: 1,
    padding: 8,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  info: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
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
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.accentSoft,
  },
  title: {
    fontFamily: fonts.displayBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.white,
  },
  sub: { color: colors.muted, fontSize: 11, lineHeight: 16, fontFamily: fonts.medium },
  error: { color: colors.error },
  controls: { flexDirection: "row", alignItems: "center", flexShrink: 0, gap: 4 },
  pressed: { backgroundColor: colors.border },
  playPressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  play: {
    height: 44,
    width: 44,
    borderRadius: layout.controlRadius,
    backgroundColor: colors.accent,
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
