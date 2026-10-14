import {
  Animated,
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  Headphones,
  CircleAlert,
  SkipBack,
  SkipForward,
} from "lucide-react-native";
import { useRadio } from "@/context/RadioContext";
import { AceLogo } from "@/components/AceLogo";
import { STATION_STREAM_SHOW_ID } from "@/data/stationShow";
import { colors } from "@/theme/colors";
import { useModalTransition } from "@/hooks/useModalTransition";
import { useShowTransition } from "@/hooks/useShowTransition";

export default function PlayerScreen() {
  const {
    playing,
    buffering,
    currentShow,
    listenerCount,
    liveShowCount,
    error,
    toggle,
    retry,
    previous,
    next,
  } = useRadio();
  const { displayedShow, fade } = useShowTransition(currentShow);
  const {
    close,
    isClosing,
    isTransitioning,
    style: slideStyle,
  } = useModalTransition();
  return (
    <Animated.View
      testID="full-player-sheet"
      style={[styles.sheet, slideStyle]}
      pointerEvents={isClosing ? "none" : "auto"}
      renderToHardwareTextureAndroid={isTransitioning}
      shouldRasterizeIOS={isTransitioning}
      collapsable={false}
    >
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable
            style={styles.close}
            onPress={close}
            disabled={isClosing}
            accessibilityRole="button"
            accessibilityLabel="Close player"
          >
            <ChevronDown color={colors.white} size={27} />
          </Pressable>
          <Text style={styles.headerLabel}>NOW PLAYING</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Animated.View
            testID="full-player-show"
            style={[styles.show, { opacity: fade }]}
          >
            <LinearGradient
              colors={["#215736", "#0B2114", "#050A07"]}
              style={styles.cover}
            >
              {displayedShow?.id === STATION_STREAM_SHOW_ID ? (
                <Image
                  source={require("../assets/shows/Live_Radio_Bg.png")}
                  style={styles.artwork}
                  resizeMode="cover"
                  accessibilityLabel="AceRadio live broadcast artwork"
                />
              ) : displayedShow?.image ? (
                <Image
                  source={displayedShow.image}
                  style={styles.artwork}
                  resizeMode="cover"
                  accessibilityLabel={displayedShow.presenter}
                />
              ) : (
                <>
                  <View style={styles.ring1} />
                  <View style={styles.ring2} />
                  <AceLogo width={210} />
                </>
              )}
            </LinearGradient>
            <View style={styles.tagRow}>
              <View style={styles.tag}>
                <View style={styles.dot} />
                <Text style={styles.tagText}>ACE RADIO · LIVE</Text>
              </View>
              <View style={styles.listeners}>
                <Headphones size={14} color={colors.green} />
                <Text style={styles.listenerText}>
                  {(displayedShow
                    ? (displayedShow.listeners ?? 0)
                    : listenerCount
                  ).toLocaleString("en-ZA")}{" "}
                  listeners
                </Text>
              </View>
            </View>
            <Text style={styles.title}>
              {displayedShow?.title ?? "Hear the difference."}
            </Text>
            <Text style={styles.byline}>
              {displayedShow?.presenter ?? "AceRadio · Cape Town, South Africa"}
            </Text>
          </Animated.View>
          <View style={styles.rule} />
          <View style={styles.controls}>
            <Pressable
              style={styles.skip}
              onPress={previous}
              disabled={liveShowCount < 2}
              accessibilityRole="button"
              accessibilityLabel="Previous live show"
              accessibilityState={{ disabled: liveShowCount < 2 }}
            >
              <SkipBack
                size={25}
                color={liveShowCount > 1 ? colors.white : colors.subtle}
              />
            </Pressable>
            <Pressable
              style={styles.play}
              onPress={toggle}
              accessibilityRole="button"
              accessibilityLabel={
                buffering
                  ? "Cancel loading live show"
                  : playing
                    ? "Pause live show"
                    : "Play live show"
              }
              accessibilityState={{ busy: buffering }}
            >
              {buffering ? (
                <ActivityIndicator color={colors.background} size="large" />
              ) : playing ? (
                <Pause
                  size={31}
                  color={colors.background}
                  fill={colors.background}
                />
              ) : (
                <Play
                  size={31}
                  color={colors.background}
                  fill={colors.background}
                />
              )}
            </Pressable>
            <Pressable
              style={styles.skip}
              onPress={next}
              disabled={liveShowCount < 2}
              accessibilityRole="button"
              accessibilityLabel="Next live show"
              accessibilityState={{ disabled: liveShowCount < 2 }}
            >
              <SkipForward
                size={25}
                color={liveShowCount > 1 ? colors.white : colors.subtle}
              />
            </Pressable>
          </View>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {buffering
              ? "Connecting to AceRadio…"
              : error
                ? "Stream unavailable · Try again below"
                : playing
                  ? "You are listening live"
                  : currentShow
                    ? "Paused · Ready when you are"
                    : "Your next favourite show is one tap away"}
          </Text>
          <Pressable
            style={styles.retry}
            onPress={retry}
            disabled={buffering}
            accessibilityRole="button"
            accessibilityLabel="Reload live show"
            accessibilityState={{ disabled: buffering }}
          >
            <RotateCcw size={16} color={colors.muted} />
            <Text style={styles.retryText}>
              {error ? "Try again" : "Reload stream"}
            </Text>
          </Pressable>
          {error && (
            <View style={styles.error}>
              <CircleAlert size={18} color="#F4B18B" />
              <Text style={styles.errorText} accessibilityRole="alert">
                {error}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    height: 61,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  headerLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
  close: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 26,
    paddingTop: 19,
    paddingBottom: 35,
    alignItems: "center",
  },
  show: { width: "100%", alignItems: "center" },
  cover: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 27,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#225534",
  },
  artwork: { width: "100%", height: "100%" },
  ring1: {
    width: "92%",
    height: "92%",
    borderRadius: 500,
    borderWidth: 2,
    borderColor: "#4B9C6130",
    position: "absolute",
  },
  ring2: {
    width: "72%",
    height: "72%",
    borderRadius: 500,
    borderWidth: 31,
    borderColor: "#4B9C6130",
    position: "absolute",
  },
  tag: {
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    backgroundColor: "#173924",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tagRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 27,
  },
  dot: { height: 7, width: 7, borderRadius: 4, backgroundColor: colors.green },
  tagText: {
    color: colors.green,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1.3,
  },
  title: {
    fontSize: 29,
    color: colors.white,
    fontWeight: "900",
    letterSpacing: -1.1,
    marginTop: 17,
    textAlign: "center",
  },
  byline: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 6,
    textAlign: "center",
  },
  schedule: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 8,
    textAlign: "center",
  },
  listeners: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#101A14",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
  },
  listenerText: {
    fontSize: 12,
    color: colors.green,
    fontVariant: ["tabular-nums"],
  },
  rule: {
    marginTop: 28,
    width: "100%",
    height: 2,
    backgroundColor: colors.border,
  },
  controls: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 27,
  },
  play: {
    width: 87,
    height: 87,
    borderRadius: 44,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  skip: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  retry: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 6,
  },
  retryText: { color: colors.muted, fontSize: 11 },
  status: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 16,
    textAlign: "center",
  },
  error: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 22,
    backgroundColor: "#30221A",
    borderRadius: 12,
    padding: 14,
  },
  errorText: { flex: 1, color: "#F4CDB7", fontSize: 12, lineHeight: 18 },
  info: {
    marginTop: 23,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 13,
  },
  infoText: { flex: 1, fontSize: 11, color: colors.muted, lineHeight: 17 },
});
