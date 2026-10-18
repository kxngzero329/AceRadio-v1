import { fonts } from "@/theme/fonts";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { STATION_STREAM_SHOW_ID } from "@/data/stationShow";
import {
  ArrowUpRight,
  Headphones,
  Mic2,
  Pause,
  Play,
  Radio,
} from "lucide-react-native";
import { useRadio } from "@/context/RadioContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useShowTransition } from "@/hooks/useShowTransition";
import { colors } from "@/theme/colors";
import { PlaybackArtwork } from "@/components/PlaybackArtwork";
import { PlaybackButton } from "@/components/PlaybackButton";
import { motion } from "@/theme/motion";

export function LiveRadioHero() {
  const {
    playing,
    buffering,
    currentShow,
    liveShows,
    listenerCount,
    error,
    toggle,
    retry,
  } = useRadio();
  const { displayedShow, fade } = useShowTransition(currentShow);
  const reducedMotion = useReducedMotion();
  const { fontScale, width } = useWindowDimensions();
  const compact = width < 360;
  const [loadedArtwork, setLoadedArtwork] = useState<string | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;
  const revealed = useRef(false);
  const artwork = displayedShow?.image ?? displayedShow?.poster;
  const isStationStream = displayedShow?.id === STATION_STREAM_SHOW_ID;
  const stationOnly = currentShow?.id === STATION_STREAM_SHOW_ID && !liveShows.length;
  // Reserve the live-show space before Play, so revealing metadata doesn't
  // push the action or the schedule card down during the artwork fade.
  const showLayout = liveShows.length > 0 || (!!currentShow && currentShow.id !== STATION_STREAM_SHOW_ID);
  const middleHeight = Math.ceil((showLayout ? 228 : 198) * Math.max(1, fontScale));
  const ready =
    !!displayedShow && (isStationStream || !artwork || loadedArtwork === displayedShow.id);
  const showOpacity = Animated.multiply(reveal, fade);

  useEffect(() => {
    if (displayedShow && !ready && revealed.current) return;
    if (ready) revealed.current = true;
    if (!displayedShow) revealed.current = false;
    const animation = Animated.timing(reveal, {
      toValue: ready ? 1 : 0,
      duration: reducedMotion ? 0 : motion.artwork,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [ready, displayedShow?.id, reducedMotion, reveal]);

  const introOpacity = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const showOffset = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });
  const label = buffering
    ? "Connecting…"
    : error
      ? "Try again"
      : playing
        ? "Pause Live"
        : currentShow
          ? "Resume Live"
          : "Listen Live";

  return (
    <LinearGradient
      testID="live-radio-hero"
      colors={[colors.surface2, colors.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <PlaybackArtwork show={currentShow} variant="hero" onReady={setLoadedArtwork} />
        <View style={styles.orbOne} />
      </View>

      <View style={styles.topRow}>
        <View style={styles.liveBadge}>
          <View style={styles.dot} />
          <Text style={styles.liveBadgeText}>LIVE RADIO</Text>
        </View>
        <View
          style={styles.listeners}
          accessibilityLabel={listenerCount === null ? "Live radio" : `${listenerCount.toLocaleString("en-ZA")} listeners`}
        >
          <Headphones size={13} color={colors.white} />
          <Text style={styles.listenersText}>
            {listenerCount === null ? "Live radio" : `${listenerCount.toLocaleString("en-ZA")} listeners`}
          </Text>
        </View>
      </View>

      <View style={[styles.middle, { minHeight: middleHeight }]}>
        {!stationOnly && <>
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden={!!currentShow}
          importantForAccessibility={
            currentShow ? "no-hide-descendants" : "auto"
          }
          style={[styles.intro, { opacity: introOpacity }]}
        >
          <Radio size={28} color={colors.accent} />
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>This is{"\n"}AceRadio.</Text>
          <Text style={styles.description}>
            More than a station. It's a whole vibe.
          </Text>
        </Animated.View>
        {displayedShow && (
          <Animated.View
            testID="live-show-details"
            pointerEvents="none"
            style={[
              styles.show,
              { opacity: showOpacity, transform: [{ translateY: showOffset }] },
            ]}
          >
            <Text style={styles.overline}>
              {buffering
                ? "CONNECTING LIVE"
                : displayedShow.id === "aceradio-live-stream"
                  ? "ON AIR NOW"
                  : playing
                    ? "YOU ARE LISTENING TO"
                    : liveShows.some((show) => show.id === displayedShow.id)
                      ? "YOUR LIVE SHOW"
                      : "SELECTED SHOW"}
            </Text>
            <Text style={[styles.showTitle, compact && styles.showTitleCompact]} numberOfLines={2}>
              {displayedShow.title}
            </Text>
            <View style={styles.presenterRow}>
              <Mic2 size={16} color={colors.accent} />
              <Text style={styles.presenter} numberOfLines={2}>
                {displayedShow.presenter}
              </Text>
            </View>
            <Text style={styles.description} numberOfLines={2}>
              {displayedShow.subtitle}
            </Text>
            <Text style={styles.schedule} numberOfLines={2}>
              {displayedShow.schedule}
            </Text>
          </Animated.View>
        )}
        </>}
      </View>

      <PlaybackButton
        testID="live-radio-toggle"
        onPress={error ? retry : toggle}
        disabled={buffering}
        accessibilityRole="button"
        accessibilityLabel={
          buffering
            ? "Loading live show"
            : error
              ? "Retry AceRadio stream"
              : playing
                ? `Pause ${currentShow?.title ?? "AceRadio"}`
                : "Listen live to AceRadio"
        }
        accessibilityState={{ disabled: buffering, busy: buffering }}
        style={({ pressed }) => [styles.listen, buffering && styles.listenLoading, pressed && styles.pressed]}
      >
        <View style={styles.listenIcon}>
          {buffering ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : playing ? (
            <Pause
              fill={colors.onAccent}
              color={colors.onAccent}
              size={18}
            />
          ) : (
            <Play
              fill={colors.onAccent}
              color={colors.onAccent}
              size={18}
            />
          )}
        </View>
        <Text style={styles.listenText}>{label}</Text>
        <ArrowUpRight size={19} color={colors.onAccent} />
      </PlaybackButton>
      <View style={{ minHeight: Math.ceil(16 * Math.max(1, fontScale)) + 10 }}>
      {!stationOnly && <Text style={styles.status} accessibilityLiveRegion="polite">
        {buffering
          ? "Connecting to AceRadio…"
          : error
            ? "Unable to connect · Try again above"
            : playing
              ? "You are listening live"
              : currentShow
                ? "Paused · Ready when you are"
                : "Live from Cape Town"}
      </Text>}
      </View>
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 350,
    borderRadius: 22,
    padding: 20,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orbOne: {
    position: "absolute",
    width: 260,
    height: 260,
    borderWidth: 1,
    borderColor: "#FFFFFF18",
    borderRadius: 140,
    top: -70,
    right: -100,
  },
  topRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  liveBadge: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  dot: { backgroundColor: colors.accent, width: 7, height: 7, borderRadius: 4 },
  liveBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontFamily: fonts.semibold,
    letterSpacing: 0.8,
  },
  listeners: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#000000A6",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  listenersText: {
    color: colors.white,
    fontSize: 11,
    fontFamily: fonts.semibold,
    fontVariant: ["tabular-nums"],
  },
  middle: {
    flex: 1,
    minHeight: 198,
    justifyContent: "center",
    marginVertical: 10,
  },
  intro: { paddingVertical: 4 },
  heroTitle: {
    fontSize: 46,
    color: colors.white,
    fontFamily: fonts.displayExtraBold,
    letterSpacing: -1.2,
    lineHeight: 48,
    marginTop: 12,
  },
  heroTitleCompact: { fontSize: 40, lineHeight: 43 },
  description: { color: colors.muted, marginTop: 10, fontSize: 13, lineHeight: 20, fontFamily: fonts.regular },
  show: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: "flex-end",
    paddingBottom: 8,
  },
  overline: {
    color: colors.accent,
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 7,
  },
  showTitle: {
    fontSize: 34,
    lineHeight: 38,
    fontFamily: fonts.displayExtraBold,
    letterSpacing: -0.6,
    color: colors.white,
  },
  showTitleCompact: { fontSize: 30, lineHeight: 35 },
  presenterRow: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    marginTop: 9,
  },
  presenter: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: fonts.semibold,
  },
  schedule: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 8, fontFamily: fonts.medium },
  listen: {
    minHeight: 56,
    backgroundColor: colors.accent,
    borderRadius: 14,
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 11,
  },
  listenLoading: { backgroundColor: colors.accentPressed },
  pressed: { opacity: 0.86 },
  listenIcon: {
    width: 31,
    height: 31,
    backgroundColor: "#00000010",
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  listenText: {
    color: colors.onAccent,
    fontSize: 15,
    fontFamily: fonts.semibold,
    letterSpacing: 0.2,
    flex: 1,
  },
  status: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10, fontFamily: fonts.medium,
  },
  preview: {
    color: colors.subtle,
    textAlign: "center",
    fontSize: 10,
    marginTop: 5, fontFamily: fonts.regular,
  },
  error: { color: colors.error, fontSize: 12, lineHeight: 18, marginTop: 10, fontFamily: fonts.regular },
});
