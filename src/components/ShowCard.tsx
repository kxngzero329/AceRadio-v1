import { memo } from "react";
import {
  Pressable,
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Heart, Clock3, Radio } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { FittedImage } from "@/components/FittedImage";
import type { Show } from "@/types/show";
import { useFavorites } from "@/context/FavoritesContext";
import { useRadio } from "@/context/RadioContext";
import { colors } from "@/theme/colors";

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
  const titleHeight = Math.ceil(19 * fontScale * 2);
  const presenterHeight = Math.ceil(16 * fontScale * 2);
  const scheduleHeight = Math.ceil(15 * fontScale * 2);
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
        <View style={[styles.image, { backgroundColor: show.accent }]}>
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
            <Clock3 size={13} color={colors.muted} style={styles.clock} />
            <Text style={styles.meta} numberOfLines={2}>
              {show.schedule}
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
        style={({ pressed }) => [styles.like, pressed && styles.likePressed]}
      >
        <Heart
          color={liked ? colors.green : colors.white}
          fill={liked ? colors.green : "transparent"}
          size={20}
        />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surface,
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
  },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: "#08110CEB",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.green,
    flexShrink: 0,
  },
  liveText: {
    flexShrink: 1,
    color: colors.green,
    fontSize: 9,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  body: { paddingTop: 12, paddingHorizontal: 10, paddingBottom: 14 },
  name: {
    fontSize: 15,
    lineHeight: 19,
    includeFontPadding: false,
    fontWeight: "800",
    color: colors.white,
  },
  presenter: {
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
    color: "#D8E0DA",
    marginTop: 4,
  },
  time: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: 8,
  },
  clock: { marginTop: 1 },
  meta: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    includeFontPadding: false,
    color: colors.muted,
  },
  like: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#08110CEB",
    alignItems: "center",
    justifyContent: "center",
  },
  likePressed: { backgroundColor: "#173D28", transform: [{ scale: 0.96 }] },
});
