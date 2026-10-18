import { fonts } from "@/theme/fonts";
import { memo } from "react";
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Heart, Clock3, Radio } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { FittedImage } from "@/components/FittedImage";
import type { Show } from "@/types/show";
import { useFavorites } from "@/context/FavoritesContext";
import { useRadio } from "@/context/RadioContext";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";

export const ShowCard = memo(function ShowCard({
  show,
  width = 196,
}: {
  show: Show;
  width?: number;
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { liveShows, listenerCount } = useRadio();
  const { fontScale } = useWindowDimensions();
  const liked = isFavorite(show.id);
  const isLive = liveShows.some((liveShow) => liveShow.id === show.id);

  // Matching text slots keep Home, Shows and Favourites cards aligned.
  const titleHeight = Math.ceil(20 * fontScale * 2);
  const presenterHeight = Math.ceil(17 * fontScale * 2);
  const scheduleHeight = Math.ceil(55 * fontScale);
  const dayPrefix = `${show.day} • `;
  const times = show.schedule.startsWith(dayPrefix)
    ? show.schedule.slice(dayPrefix.length)
    : show.schedule;
  const listeners = listenerCount?.toLocaleString("en-ZA");
  const showListenerCount =
    listeners !== undefined && width >= 150 && fontScale <= 1.3;

  return (
    <View testID={`show-card-${show.id}`} style={[styles.card, { width }]}>
      <Pressable
        testID={`show-details-${show.id}`}
        style={({ pressed }) => pressed && styles.pressed}
        onPress={() =>
          router.push({ pathname: "/show/[id]", params: { id: show.id } })
        }
        accessibilityRole="button"
        accessibilityLabel={`View ${show.title}, ${show.presenter}. ${show.schedule}`}
      >
        <View style={styles.image}>
          {show.image ? (
            <FittedImage
              source={show.image}
              accessibilityLabel={show.presenter}
            />
          ) : (
            <Radio color={colors.white} size={48} />
          )}
          {isLive && (
            <View
              testID={`show-live-badge-${show.id}`}
              accessibilityLabel={
                listeners ? `Live now, ${listeners} listeners` : "Live now"
              }
              style={[styles.liveBadge, { maxWidth: Math.max(44, width - 68) }]}
            >
              <View style={styles.liveDot} />
              <Text style={styles.liveText} numberOfLines={1}>
                {showListenerCount ? `LIVE · ${listeners}` : "LIVE"}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.body}>
          <Text
            style={[styles.name, { height: titleHeight }]}
            numberOfLines={2}
          >
            {show.title}
          </Text>
          <Text
            style={[styles.presenter, { height: presenterHeight }]}
            numberOfLines={2}
          >
            {show.presenter}
          </Text>
          <View style={[styles.time, { height: scheduleHeight }]}>
            <View style={styles.dayRow}>
              <Clock3 size={12} color={colors.muted} />
              <Text style={styles.day} numberOfLines={1}>
                {show.day || "Schedule"}
              </Text>
            </View>
            <Text style={styles.meta} numberOfLines={2}>
              {times}
            </Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        testID={`show-favourite-${show.id}`}
        onPress={() => toggleFavorite(show.id)}
        accessibilityRole="button"
        accessibilityLabel={
          liked
            ? `Remove ${show.title} from favourites`
            : `Save ${show.title} to favourites`
        }
        accessibilityState={{ selected: liked }}
        {...(Platform.OS === "web" ? { "aria-pressed": liked } : {})}
        style={({ pressed }) => [styles.like, pressed && styles.likePressed]}
      >
        <Heart
          color={liked ? colors.accent : colors.white}
          fill={liked ? colors.accent : "transparent"}
          size={20}
        />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: layout.cardRadius,
    overflow: "hidden",
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.82 },
  image: {
    width: "100%",
    aspectRatio: 1,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: colors.artworkScrim,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    flexShrink: 0,
  },
  liveText: {
    flexShrink: 1,
    color: colors.accent,
    fontSize: 10,
    fontFamily: fonts.semibold,
    fontVariant: ["tabular-nums"],
  },
  body: { padding: 12 },
  name: {
    fontSize: 15,
    lineHeight: 20,
    includeFontPadding: false,
    fontFamily: fonts.displayBold,
    color: colors.white,
  },
  presenter: {
    fontSize: 12,
    lineHeight: 17,
    includeFontPadding: false,
    color: colors.muted,
    marginTop: 3, fontFamily: fonts.medium,
  },
  time: {
    gap: 4,
    marginTop: 8,
  },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  day: { flex: 1, fontSize: 11, lineHeight: 15, color: colors.muted, fontFamily: fonts.medium },
  meta: {
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    color: colors.white, fontFamily: fonts.medium,
  },
  like: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.artworkScrim,
    alignItems: "center",
    justifyContent: "center",
  },
  likePressed: { backgroundColor: colors.accentSoft, transform: [{ scale: 0.96 }] },
});
