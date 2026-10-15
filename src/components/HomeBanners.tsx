import { Pressable, StyleSheet, View } from "react-native";
import { useContent } from "@/context/ContentContext";
import { router } from "@/utils/navigation";
import { imageAspectRatio } from "@/utils/imageAspectRatio";
import { FittedImage } from "@/components/FittedImage";
import { openVerifiedLink } from "@/services/links";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";

export function HomeBanners() {
  const { banners } = useContent();
  const items = banners.filter(banner => banner.placement === "home_banner");
  if (!items.length) return null;
  return <View style={styles.list}>{items.map(banner => <Pressable key={banner.id}
    disabled={!banner.showId && !banner.linkUrl} accessibilityLabel={banner.title}
    accessibilityRole={banner.showId || banner.linkUrl ? "button" : undefined}
    accessibilityState={{ disabled: !banner.showId && !banner.linkUrl }}
    style={({ pressed }) => [styles.banner, { aspectRatio: imageAspectRatio(banner.image, 2) }, pressed && styles.pressed]}
    onPress={() => {
      if (banner.showId) router.push({ pathname: "/show/[id]", params: { id: banner.showId } });
      else if (banner.linkUrl) void openVerifiedLink(banner.title, banner.linkUrl);
    }}><FittedImage source={banner.image} accessibilityLabel={banner.title} /></Pressable>)}</View>;
}
const styles = StyleSheet.create({
  list: { gap: 12, marginBottom: 16 },
  banner: { width: "100%", borderRadius: layout.cardRadius, overflow: "hidden", backgroundColor: colors.surface },
  pressed: { opacity: 0.8 },
});
