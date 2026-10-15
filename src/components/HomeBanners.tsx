import { Pressable, StyleSheet, View } from "react-native";
import { useContent } from "@/context/ContentContext";
import { router } from "@/utils/navigation";
import { imageAspectRatio } from "@/utils/imageAspectRatio";
import { FittedImage } from "@/components/FittedImage";
import { openVerifiedLink } from "@/services/links";

export function HomeBanners() {
  const { banners } = useContent();
  const items = banners.filter(banner => banner.placement === "home_banner");
  if (!items.length) return null;
  return <View style={styles.list}>{items.map(banner => <Pressable key={banner.id}
    disabled={!banner.showId && !banner.linkUrl} accessibilityLabel={banner.title}
    accessibilityRole={banner.showId || banner.linkUrl ? "button" : undefined}
    style={{ width: "100%", aspectRatio: imageAspectRatio(banner.image, 2) }}
    onPress={() => {
      if (banner.showId) router.push({ pathname: "/show/[id]", params: { id: banner.showId } });
      else if (banner.linkUrl) void openVerifiedLink(banner.title, banner.linkUrl);
    }}><FittedImage source={banner.image} accessibilityLabel={banner.title} /></Pressable>)}</View>;
}
const styles = StyleSheet.create({ list: { gap: 14, marginVertical: 14 } });
