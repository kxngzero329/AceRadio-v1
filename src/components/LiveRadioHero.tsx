import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
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
  const { fontScale } = useWindowDimensions();
  const [loadedArtwork, setLoadedArtwork] = useState<string | null>(null);
  const reveal = useRef(new Animated.Value(0)).current;
  const revealed = useRef(false);
  const artwork = displayedShow?.image ?? displayedShow?.poster;
  const isStationStream = displayedShow?.id === STATION_STREAM_SHOW_ID;
  const ready =
    !!displayedShow && (!artwork || loadedArtwork === displayedShow.id);
  const showOpacity = Animated.multiply(reveal, fade);

  useEffect(() => {
    if (displayedShow && !ready && revealed.current) return;
    if (ready) revealed.current = true;
    if (!displayedShow) revealed.current = false;
    const animation = Animated.timing(reveal, {
      toValue: ready ? 1 : 0,
      duration: reducedMotion ? 0 : 650,
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
    outputRange: [18, 0],
  });
  const artworkScale = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [1.06, 1],
  });
  const label = buffering
    ? "TUNING IN..."
    : error
      ? "TRY AGAIN"
      : playing
        ? "PAUSE LIVE"
        : currentShow
          ? "RESUME LIVE"
          : "LISTEN LIVE";

  return (
    <LinearGradient
      testID="live-radio-hero"
      colors={["#143B25", "#0A1C13", "#09120D"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {isStationStream && (
          <View style={styles.backgroundArtworkFrame}>
            <Image
              testID="live-radio-background-artwork"
              source={require("../../assets/shows/Live_Radio_Bg.png")}
              style={styles.backgroundArtwork}
              resizeMode="stretch"
              accessibilityIgnoresInvertColors
              accessible={false}
            />
          </View>
        )}
        <LinearGradient
          colors={["#05080630", "#05080655", "#0508069C"]}
          locations={[0, 0.48, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.orbOne} />
        {displayedShow && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { opacity: showOpacity, transform: [{ scale: artworkScale }] },
            ]}
          >
            {artwork && !isStationStream && (
              <Animated.Image
                testID="live-show-artwork"
                key={displayedShow.id}
                source={artwork}
                style={styles.artwork}
                resizeMode="cover"
                accessible={false}
                onLoad={() => setLoadedArtwork(displayedShow.id)}
                onError={() => setLoadedArtwork(displayedShow.id)}
              />
            )}
            <LinearGradient
              colors={["#05080625", "#05080665", "#050806B8"]}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
      </View>

      <View style={styles.topRow}>
        <View style={styles.liveBadge}>
          <View style={styles.dot} />
          <Text style={styles.liveBadgeText}>LIVE RADIO</Text>
        </View>
        <View
          style={styles.listeners}
          accessibilityLabel={`${listenerCount.toLocaleString("en-ZA")} listeners`}
        >
          <Headphones size={13} color={colors.white} />
          <Text style={styles.listenersText}>
            {listenerCount.toLocaleString("en-ZA")} listeners
          </Text>
        </View>
      </View>

      <View style={[styles.middle, { minHeight: Math.ceil(237 * fontScale) }]}>
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden={!!currentShow}
          importantForAccessibility={
            currentShow ? "no-hide-descendants" : "auto"
          }
          style={[styles.intro, { opacity: introOpacity }]}
        >
          <Radio size={38} color={colors.green} />
          <Text style={styles.heroTitle}>This is{"\n"}AceRadio.</Text>
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
                ? "FINDING YOUR VIBE"
                : displayedShow.id === "aceradio-live-stream"
                  ? "ON AIR NOW"
                  : playing
                  ? "YOU ARE LISTENING TO"
                  : liveShows.some((show) => show.id === displayedShow.id)
                    ? "YOUR LIVE SHOW"
                    : "SELECTED SHOW"}
            </Text>
            <Text style={styles.showTitle} numberOfLines={2}>
              {displayedShow.title}
            </Text>
            <View style={styles.presenterRow}>
              <Mic2 size={16} color={colors.green} />
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
      </View>

      <Pressable
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
        style={({ pressed }) => [styles.listen, pressed && styles.pressed]}
      >
        <View style={styles.listenIcon}>
          {buffering ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : playing ? (
            <Pause
              fill={colors.background}
              color={colors.background}
              size={18}
            />
          ) : (
            <Play
              fill={colors.background}
              color={colors.background}
              size={18}
            />
          )}
        </View>
        <Text style={styles.listenText}>{label}</Text>
        <ArrowUpRight size={19} color={colors.background} />
      </Pressable>
      <Text style={styles.status} accessibilityLiveRegion="polite">
        {buffering
          ? "Connecting to AceRadio…"
          : error
            ? "Unable to connect · Try again above"
            : playing
              ? "You are listening live"
              : currentShow
                ? "Paused · Ready when you are"
                : "Live radio, one tap away"}
      </Text>
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
    minHeight: 380,
    borderRadius: 25,
    padding: 23,
    overflow: "hidden",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#235639",
  },
  orbOne: {
    position: "absolute",
    width: 270,
    height: 270,
    borderWidth: 47,
    borderColor: "#36D57A1A",
    borderRadius: 140,
    top: -56,
    right: -75,
  },
  backgroundArtworkFrame: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundArtwork: { width: "100%", height: "100%" },
  artwork: { width: "100%", height: "100%" },
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
    backgroundColor: "#143D28E6",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dot: { backgroundColor: colors.green, width: 7, height: 7, borderRadius: 4 },
  liveBadgeText: {
    color: "#B5FFCB",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  listeners: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#050806A6",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },
  listenersText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  middle: {
    flex: 1,
    minHeight: 237,
    justifyContent: "center",
    marginVertical: 13,
  },
  intro: { paddingVertical: 12 },
  heroTitle: {
    fontSize: 44,
    color: colors.white,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 47,
    marginTop: 10,
  },
  description: { color: "#CDDBD2", marginTop: 8, fontSize: 13, lineHeight: 19 },
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
    color: colors.green,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 1.6,
    marginBottom: 7,
  },
  showTitle: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: "900",
    letterSpacing: -1.3,
    color: colors.white,
  },
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
    fontWeight: "700",
  },
  schedule: { color: "#B1C6B8", fontSize: 11, lineHeight: 16, marginTop: 8 },
  listen: {
    minHeight: 56,
    backgroundColor: colors.green,
    borderRadius: 17,
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 11,
  },
  pressed: { opacity: 0.86 },
  listenIcon: {
    width: 31,
    height: 31,
    backgroundColor: "#FFFFFF7A",
    borderRadius: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  listenText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
    flex: 1,
  },
  status: {
    color: "#B1C6B8",
    textAlign: "center",
    fontSize: 10,
    marginTop: 10,
  },
  preview: {
    color: "#B1C6B8",
    textAlign: "center",
    fontSize: 10,
    marginTop: 5,
  },
  error: { color: "#F4CDB7", fontSize: 12, lineHeight: 18, marginTop: 10 },
});
