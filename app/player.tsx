import { fonts } from "@/theme/fonts";
import {
  Animated,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  Headphones,
  CircleAlert,
} from "lucide-react-native";
import { useRadio } from "@/context/RadioContext";
import { PlaybackArtwork } from "@/components/PlaybackArtwork";
import { PlaybackButton } from "@/components/PlaybackButton";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import { typography } from "@/theme/typography";
import { useModalTransition } from "@/hooks/useModalTransition";
import { useShowTransition } from "@/hooks/useShowTransition";

export default function PlayerScreen() {
  const {
    playing,
    buffering,
    currentShow,
    listenerCount,
    error,
    toggle,
    retry,
  } = useRadio();
  const { displayedShow, fade } = useShowTransition(currentShow);
  const {
    close,
    isClosing,
    isTransitioning,
    style: slideStyle,
  } = useModalTransition();
  const { width, height } = useWindowDimensions();
  const coverSize = Math.min(width - 40, 320, Math.max(180, height * 0.37));
  const status = buffering
    ? "Connecting to AceRadio…"
    : error
      ? "Connection interrupted"
      : playing
        ? "You’re listening live"
        : currentShow
          ? "Paused · Ready when you are"
          : "Ready to listen live";
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
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            onPress={close}
            disabled={isClosing}
            accessibilityRole="button"
            accessibilityLabel="Close player"
            accessibilityState={{ disabled: isClosing }}
          >
            <ChevronDown color={colors.white} size={25} />
          </Pressable>
          <Text style={styles.headerLabel}>Live radio</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          testID="full-player-scroll"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <View testID="full-player-show" style={styles.show}>
            <View style={[styles.cover, { width: coverSize }]}>
              <PlaybackArtwork show={currentShow} variant="cover" />
            </View>
            <View style={styles.tagRow}>
              <View style={styles.tag}>
                <View style={styles.dot} />
                <Text style={styles.tagText}>LIVE BROADCAST</Text>
              </View>
              <View style={styles.listeners}>
                <Headphones size={14} color={colors.muted} />
                <Text style={styles.listenerText}>
                  {listenerCount === null
                    ? "Live radio"
                    : `${listenerCount.toLocaleString("en-ZA")} ${listenerCount === 1 ? "listener" : "listeners"}`}
                </Text>
              </View>
            </View>
            <Animated.Text accessibilityRole="header" style={[styles.title, { opacity: fade }]}>
              {displayedShow?.title ?? "AceRadio Live"}
            </Animated.Text>
            <Animated.Text style={[styles.byline, { opacity: fade }]}>
              {displayedShow?.presenter ?? "Cape Town, South Africa"}
            </Animated.Text>
          </View>
          <View style={styles.controls}>
            <PlaybackButton
              testID="full-player-toggle"
              style={({ pressed }) => [
                styles.play,
                buffering && styles.playLoading,
                pressed && styles.playPressed,
              ]}
              onPress={toggle}
              disabled={isClosing}
              accessibilityRole="button"
              accessibilityLabel={
                buffering
                  ? "Cancel loading live show"
                  : playing
                    ? "Pause live show"
                    : "Play live show"
              }
              accessibilityState={{ busy: buffering, disabled: isClosing }}
              aria-busy={buffering}
            >
              {buffering ? (
                <ActivityIndicator color={colors.onAccent} size="large" />
              ) : playing ? (
                <Pause
                  size={30}
                  color={colors.onAccent}
                  fill={colors.onAccent}
                />
              ) : (
                <Play
                  size={30}
                  color={colors.onAccent}
                  fill={colors.onAccent}
                />
              )}
            </PlaybackButton>
          </View>
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            <View
              style={[
                styles.statusDot,
                playing && !buffering && !error && styles.dotLive,
                error && styles.dotError,
              ]}
            />
            <Text style={styles.status}>{status}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.retry,
              pressed && styles.pressed,
              buffering && styles.disabled,
            ]}
            onPress={retry}
            disabled={buffering || isClosing}
            accessibilityRole="button"
            accessibilityLabel="Reload live show"
            accessibilityState={{ disabled: buffering || isClosing }}
          >
            <RotateCcw size={15} color={colors.muted} />
            <Text style={styles.retryText}>
              {error ? "Try again" : "Reload stream"}
            </Text>
          </Pressable>
          {error && (
            <View style={styles.error}>
              <CircleAlert size={18} color={colors.error} />
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
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  headerLabel: { color: colors.muted, fontSize: 13, fontFamily: fonts.semibold },
  headerSpacer: { width: 44 },
  close: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    alignItems: "center",
  },
  show: { width: "100%", alignItems: "center" },
  cover: {
    aspectRatio: 1,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  tag: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: colors.accent },
  tagText: {
    color: colors.accent,
    fontFamily: fonts.semibold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  listeners: { flexDirection: "row", alignItems: "center", gap: 6 },
  listenerText: { ...typography.caption, fontVariant: ["tabular-nums"] },
  title: {
    fontSize: 30,
    lineHeight: 36,
    color: colors.white,
    fontFamily: fonts.displayExtraBold,
    letterSpacing: -0.8,
    marginTop: 14,
    textAlign: "center",
  },
  byline: { ...typography.body, marginTop: 5, textAlign: "center" },
  controls: {
    width: "100%",
    maxWidth: 300,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  play: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  playLoading: { backgroundColor: colors.accentPressed },
  playPressed: { opacity: 0.8 },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.4 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 18,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.subtle,
  },
  dotLive: { backgroundColor: colors.accent },
  dotError: { backgroundColor: colors.error },
  status: { ...typography.caption, flexShrink: 1, textAlign: "center" },
  retry: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4,
    paddingHorizontal: 14,
    borderRadius: layout.controlRadius,
  },
  retryText: { ...typography.caption },
  error: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginTop: 12,
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: layout.controlRadius,
    padding: 14,
  },
  errorText: { flex: 1, color: colors.error, fontSize: 13, lineHeight: 20, fontFamily: fonts.regular },
});
