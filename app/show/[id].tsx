import {
  Animated,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  Heart,
  CalendarDays,
  Mic2,
  Play,
  Radio,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ShowPoster } from "@/components/ShowPoster";
import { FittedImage } from "@/components/FittedImage";
import { getShow } from "@/data/shows";
import { useFavorites } from "@/context/FavoritesContext";
import { useRadio } from "@/context/RadioContext";
import { useModalTransition } from "@/hooks/useModalTransition";
import { colors } from "@/theme/colors";
export default function ShowDetail() {
  const {
    close,
    isClosing,
    isTransitioning,
    style: slideStyle,
  } = useModalTransition();
  const { id } = useLocalSearchParams<{ id: string }>();
  const show = getShow(id);
  const { isFavorite, toggleFavorite } = useFavorites();
  const { listenLive, liveShows } = useRadio();
  if (!show)
    return (
      <Animated.View style={[styles.sheet, slideStyle]}>
        <SafeAreaView style={styles.root}>
          <Pressable accessibilityRole="button" onPress={() => close()}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Show not found</Text>
        </SafeAreaView>
      </Animated.View>
    );
  const liked = isFavorite(show.id);
  const isOnAir = liveShows.some((liveShow) => liveShow.id === show.id);
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
            onPress={() => close()}
            accessibilityLabel="Go back"
            style={styles.circle}
          >
            <ChevronLeft color={colors.white} />
          </Pressable>
          <Text style={styles.topTitle}>SHOW DETAILS</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              liked ? "Remove favourite" : "Add to favourites"
            }
            onPress={() => toggleFavorite(show.id)}
            style={styles.circle}
          >
            <Heart
              color={colors.white}
              size={22}
              fill={liked ? colors.green : "transparent"}
            />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.image}>
            {show.image ? (
              <FittedImage
                source={show.image}
                accessibilityLabel={show.presenter}
              />
            ) : (
              <LinearGradient
                colors={[show.accent, colors.surface]}
                style={[StyleSheet.absoluteFill, styles.placeholder]}
              >
                <Radio color={colors.white} size={84} />
              </LinearGradient>
            )}
          </View>
          <Text style={styles.overline}>ACE RADIO ORIGINAL</Text>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{show.title}</Text>
            <View
              testID="show-air-status"
              accessibilityLabel={isOnAir ? "On Air" : "Off Air"}
              style={[styles.airBadge, isOnAir ? styles.airOn : styles.airOff]}
            >
              <View
                style={[
                  styles.airDot,
                  isOnAir ? styles.airDotOn : styles.airDotOff,
                ]}
              />
              <Text
                style={[
                  styles.airText,
                  isOnAir ? styles.airTextOn : styles.airTextOff,
                ]}
              >
                {isOnAir ? "ON AIR" : "OFF AIR"}
              </Text>
            </View>
          </View>
          <View style={styles.detail}>
            <Mic2 size={17} color={colors.green} />
            <Text style={styles.info}>{show.presenter}</Text>
          </View>
          <View style={styles.detail}>
            <CalendarDays size={17} color={colors.green} />
            <Text style={styles.info}>{show.schedule}</Text>
          </View>
          <View style={styles.rule} />
          <Text style={styles.heading}>About the show</Text>
          <Text style={styles.desc}>{show.detail}</Text>
          <Text style={styles.desc}>{show.subtitle}</Text>
          {show.poster ? (
            <View style={styles.poster}>
              <Text style={styles.heading}>Show spotlight</Text>
              <ShowPoster show={show} />
            </View>
          ) : null}
          <Pressable
            testID="show-listen-live"
            accessibilityRole="button"
            accessibilityState={{ disabled: !isOnAir }}
            disabled={!isOnAir}
            style={[styles.listen, !isOnAir && styles.listenDisabled]}
            accessibilityLabel="Listen to live radio"
            onPress={() => {
              if (!isOnAir) return;
              listenLive(show.id);
              close();
            }}
          >
            <Play color={colors.background} fill={colors.background} />
            <Text style={styles.listenText}>LISTEN LIVE</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  sheet: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.background },
  top: {
    height: 63,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 21,
  },
  circle: {
    width: 42,
    height: 42,
    backgroundColor: colors.surface,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.7,
  },
  scroll: { paddingHorizontal: 22, paddingBottom: 30 },
  image: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.surface,
    marginTop: 9,
    marginBottom: 23,
  },
  poster: { marginTop: 26, gap: 14 },
  placeholder: { alignItems: "center", justifyContent: "center" },
  overline: {
    fontSize: 10,
    letterSpacing: 2,
    color: colors.green,
    fontWeight: "900",
  },
  title: {
    color: colors.white,
    fontSize: 33,
    fontWeight: "900",
    letterSpacing: -1.2,
    marginTop: 9,
  },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  airBadge: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 9,
  },
  airOn: { backgroundColor: "#153A24", borderColor: "#2D7646", borderWidth: 1 },
  airOff: { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 },
  airDot: { width: 6, height: 6, borderRadius: 3 },
  airDotOn: { backgroundColor: colors.green },
  airDotOff: { backgroundColor: colors.subtle },
  airText: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  airTextOn: { color: colors.green },
  airTextOff: { color: colors.muted },
  detail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 15,
  },
  info: { color: colors.muted, fontSize: 14 },
  rule: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 25,
    marginBottom: 24,
  },
  heading: { fontSize: 18, color: colors.white, fontWeight: "900" },
  desc: { fontSize: 14, lineHeight: 22, color: colors.muted, marginTop: 14 },
  listen: {
    marginTop: 35,
    backgroundColor: colors.green,
    padding: 16,
    borderRadius: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
  },
  listenDisabled: { backgroundColor: colors.surface2, opacity: 0.65 },
  listenText: {
    color: colors.background,
    fontWeight: "900",
    letterSpacing: 1.2,
    fontSize: 13,
  },
  back: { color: colors.white, margin: 20 },
});
