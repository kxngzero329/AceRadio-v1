import { fonts } from "@/theme/fonts";
import {
  Animated,
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Heart,
  CalendarDays,
  Mic2,
  Play,
  Pause,
  Radio,
} from "lucide-react-native";
import { ShowPoster } from "@/components/ShowPoster";
import { FittedImage } from "@/components/FittedImage";
import { useContent } from "@/context/ContentContext";
import { ContentStatus } from "@/components/ContentStatus";
import { useFavorites } from "@/context/FavoritesContext";
import { useRadio } from "@/context/RadioContext";
import { useModalTransition } from "@/hooks/useModalTransition";
import { colors } from "@/theme/colors";
import { layout, miniPlayerClearance } from "@/theme/layout";
import { typography } from "@/theme/typography";
import { ShowShareButton } from "@/components/ShowShareButton";
import { MiniPlayer } from "@/components/MiniPlayer";
import { PlaybackButton } from "@/components/PlaybackButton";

export default function ShowDetail() {
  const {
    close,
    isClosing,
    isTransitioning,
    style: slideStyle,
  } = useModalTransition();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { shows, presenters, loading, error } = useContent();
  const show = shows.find((item) => item.id === id);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { listenLive, liveShows, currentShow, playing, buffering, error: playbackError, hasPlayed, toggle, retry } = useRadio();
  const { fontScale } = useWindowDimensions();
  const liked = show ? isFavorite(show.id) : false;
  const isOnAir = liveShows.some((liveShow) => liveShow.id === show?.id);
  const selected = !!show && currentShow?.id === show.id;
  const canControl = isOnAir || selected;
  const connecting = selected && buffering;
  const listening = selected && playing;
  const streamError = selected ? playbackError : null;
  const playbackLabel = connecting ? "Connecting…" : streamError ? "Try again" : listening ? "Pause Live" : selected ? "Resume Live" : "Listen Live";
  const showPresenters = (show?.presenterIds ?? []).flatMap((presenterId) => {
    const presenter = presenters.find((item) => item.id === presenterId);
    return presenter?.bio ? [presenter] : [];
  });
  return (
    <Animated.View
      testID="show-detail-sheet"
      style={[styles.sheet, slideStyle]}
      pointerEvents={isClosing ? "none" : "auto"}
      renderToHardwareTextureAndroid={isTransitioning}
      shouldRasterizeIOS={isTransitioning}
      collapsable={false}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.root}>
        <View style={styles.top}>
          <Pressable
            onPress={close}
            disabled={isClosing}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityState={{ disabled: isClosing }}
            style={({ pressed }) => [styles.circle, pressed && styles.pressed]}
          >
            <ChevronLeft color={colors.white} size={23} />
          </Pressable>
          <Text style={styles.topTitle}>Show details</Text>
          {show ? (
            <Pressable
              testID="show-detail-favourite"
              accessibilityRole="button"
              accessibilityLabel={
                liked ? "Remove favourite" : "Add to favourites"
              }
              accessibilityState={{ selected: liked, disabled: isClosing }}
              {...(Platform.OS === "web" ? { "aria-pressed": liked } : {})}
              disabled={isClosing}
              onPress={() => toggleFavorite(show.id)}
              style={({ pressed }) => [
                styles.circle,
                liked && styles.favoriteActive,
                pressed && styles.pressed,
              ]}
            >
              <Heart
                color={liked ? colors.accent : colors.white}
                size={21}
                fill={liked ? colors.accent : "transparent"}
              />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>
        <ScrollView
          testID="show-detail-scroll"
          contentContainerStyle={[styles.scroll, hasPlayed && currentShow && { paddingBottom: miniPlayerClearance(fontScale) }]}
          showsVerticalScrollIndicator={false}
        >
          {!show ? (
            <View style={styles.missing}>
              <ContentStatus />
              {!loading && !error && (
                <>
                  <Radio size={36} color={colors.subtle} />
                  <Text accessibilityRole="header" style={styles.title}>
                    Show not found
                  </Text>
                  <Text style={styles.desc}>
                    This show may no longer be available. Head back to explore
                    the lineup.
                  </Text>
                </>
              )}
            </View>
          ) : (
            <>
              <View style={styles.image}>
                {show.image ? (
                  <FittedImage
                    source={show.image}
                    accessibilityLabel={`${show.title} artwork`}
                  />
                ) : (
                  <Radio color={colors.accent} size={64} />
                )}
              </View>
              <View style={styles.overlineRow}>
                <Text style={typography.eyebrow}>ACE RADIO ORIGINAL</Text>
                <View
                  testID="show-air-status"
                  accessibilityLabel={isOnAir ? "On Air" : "Off Air"}
                  style={[styles.airBadge, isOnAir && styles.airOn]}
                >
                  <View style={[styles.airDot, isOnAir && styles.airDotOn]} />
                  <Text style={[styles.airText, isOnAir && styles.airTextOn]}>
                    {isOnAir ? "On air" : "Scheduled"}
                  </Text>
                </View>
              </View>
              <Text accessibilityRole="header" style={styles.title}>
                {show.title}
              </Text>
              <View style={styles.presenter}>
                <Mic2 size={16} color={colors.accent} />
                <Text style={styles.presenterName}>{show.presenter}</Text>
              </View>
              <View style={styles.schedule}>
                <CalendarDays size={18} color={colors.accent} />
                <View style={styles.scheduleCopy}>
                  <Text style={styles.scheduleText}>{show.schedule}</Text>
                  <Text style={styles.timezone}>
                    South African Standard Time · SAST
                  </Text>
                </View>
              </View>
              <PlaybackButton
                testID="show-listen-live"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canControl || isClosing, busy: connecting }}
                disabled={!canControl || isClosing}
                style={({ pressed }) => [
                  styles.listen,
                  !canControl && styles.listenDisabled,
                  pressed && styles.listenPressed,
                ]}
                accessibilityLabel={connecting ? `Cancel connecting to ${show.title}` : streamError ? `Retry ${show.title} live stream` : listening ? `Pause ${show.title}` : selected ? `Resume ${show.title} live stream` : `Listen live to ${show.title}`}
                accessibilityHint={connecting ? "Tap to cancel the connection." : undefined}
                onPress={() => {
                  if (!canControl || isClosing) return;
                  if (selected) {
                    if (streamError) retry();
                    else toggle();
                  } else listenLive(show.id);
                }}
              >
                {connecting ? <ActivityIndicator size="small" color={colors.onAccent} /> : listening ? <Pause size={20} color={colors.onAccent} fill={colors.onAccent} /> : <Play
                  size={20}
                  color={canControl ? colors.onAccent : colors.muted}
                  fill={canControl ? colors.onAccent : colors.muted}
                />}
                <Text
                  style={[
                    styles.listenText,
                    !canControl && styles.listenTextDisabled,
                  ]}
                >
                  {playbackLabel}
                </Text>
              </PlaybackButton>
              {streamError && <Text testID="show-playback-error" style={styles.streamError} accessibilityRole="alert">{streamError}</Text>}
              {connecting && <Text style={styles.listenHint}>Tap to cancel the connection.</Text>}
              {!canControl && (
                <Text style={styles.listenHint}>
                  Tune in when this show is on air.
                </Text>
              )}
              <ShowShareButton show={show} disabled={isClosing} />
              <View style={styles.about}>
                <Text
                  accessibilityRole="header"
                  style={typography.sectionTitle}
                >
                  About the show
                </Text>
                {show.detail ? (
                  <Text style={styles.desc}>{show.detail}</Text>
                ) : null}
                {show.subtitle && show.subtitle !== show.detail ? (
                  <Text style={styles.desc}>{show.subtitle}</Text>
                ) : null}
              </View>
              {showPresenters.map((presenter) => (
                <View key={presenter.id} style={styles.presenterBio}>
                  {presenter.photo && (
                    <Image
                      source={presenter.photo}
                      style={styles.presenterPhoto}
                      accessibilityLabel={presenter.name}
                    />
                  )}
                  <View style={styles.bioCopy}>
                    <Text accessibilityRole="header" style={styles.bioTitle}>
                      {presenter.name}
                    </Text>
                    <Text style={styles.desc}>{presenter.bio}</Text>
                  </View>
                </View>
              ))}
              {show.poster ? (
                <View style={styles.poster}>
                  <Text
                    accessibilityRole="header"
                    style={typography.sectionTitle}
                  >
                    Show spotlight
                  </Text>
                  <View style={styles.posterFrame}>
                    <ShowPoster show={show} />
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
        <MiniPlayer placement="sheet" />
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, backgroundColor: colors.background },
  top: {
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteActive: { backgroundColor: colors.accentSoft },
  pressed: { backgroundColor: colors.surface2 },
  headerSpacer: { width: 44 },
  topTitle: { color: colors.muted, fontSize: 13, fontFamily: fonts.semibold },
  scroll: {
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  image: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  overlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  airBadge: {
    minHeight: 28,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface2,
  },
  airOn: { backgroundColor: colors.accentSoft },
  airDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.subtle,
  },
  airDotOn: { backgroundColor: colors.accent },
  airText: { fontSize: 11, fontFamily: fonts.semibold, color: colors.muted },
  airTextOn: { color: colors.accent },
  title: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fonts.displayBold,
    letterSpacing: -0.8,
    marginTop: 10,
  },
  presenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  presenterName: { ...typography.body, flex: 1 },
  schedule: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    marginTop: 20,
    backgroundColor: colors.surface,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scheduleCopy: { flex: 1, gap: 5 },
  scheduleText: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.semibold,
  },
  timezone: { ...typography.caption, color: colors.subtle },
  listen: {
    minHeight: 54,
    padding: 14,
    marginTop: 16,
    backgroundColor: colors.accent,
    borderRadius: layout.controlRadius,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  listenDisabled: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listenPressed: { opacity: 0.8 },
  listenText: { color: colors.onAccent, fontFamily: fonts.semibold, fontSize: 15 },
  listenTextDisabled: { color: colors.muted },
  listenHint: { ...typography.caption, textAlign: "center", marginTop: 8 },
  streamError: { ...typography.caption, color: colors.error, textAlign: "center", marginTop: 8 },
  about: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 24,
    marginTop: 24,
  },
  desc: { ...typography.body, marginTop: 10 },
  presenterBio: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    marginTop: 24,
  },
  presenterPhoto: { width: 56, height: 56, borderRadius: layout.controlRadius },
  bioCopy: { flex: 1 },
  bioTitle: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.displayBold,
  },
  poster: { marginTop: 24, gap: 14 },
  posterFrame: {
    borderRadius: layout.cardRadius,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  missing: { paddingTop: 24, alignItems: "center" },
});
