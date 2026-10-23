import { CachedImage as Image } from "@/components/CachedImage";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { colors } from "@/theme/colors";

function Artwork({
  uri,
  title,
  detail,
}: {
  uri: string;
  title: string;
  detail: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState(1.6);
  return (
    <View style={[styles.frame, { aspectRatio: detail ? ratio : 1.8 }]}>
      {!failed && (
        <Image
          source={{ uri }}
          resizeMode="contain"
          style={styles.image}
          accessibilityLabel={`${title} artwork`}
          fadeDuration={0}
          onLoad={(event) => {
            // Native supplies source dimensions; RN Web forwards the DOM load event.
            const source = event.nativeEvent.source;
            const target = (
              event.nativeEvent as unknown as {
                target?: { naturalWidth?: number; naturalHeight?: number };
              }
            ).target;
            const width = source?.width ?? target?.naturalWidth;
            const height = source?.height ?? target?.naturalHeight;
            if (width && height)
              setRatio(Math.max(0.5, Math.min(2, width / height)));
            setLoading(false);
          }}
          onError={() => {
            setFailed(true);
            setLoading(false);
          }}
        />
      )}
      {loading && (
        <ActivityIndicator
          color={colors.muted}
          accessibilityLabel="Loading artwork"
        />
      )}
      {failed && (
        <View
          testID="event-artwork-unavailable"
          accessible
          accessibilityRole="image"
          accessibilityLabel="Artwork unavailable"
        >
          <CalendarDays color={colors.subtle} size={36} accessible={false} />
        </View>
      )}
    </View>
  );
}
export function EventArtwork({
  uri,
  title,
  detail = false,
}: {
  uri: string;
  title: string;
  detail?: boolean;
}) {
  return <Artwork key={uri} uri={uri} title={title} detail={detail} />;
}
const styles = StyleSheet.create({
  frame: {
    width: "100%",
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: {
    position: "absolute",
    width: "100%",
    height: "100%",
    top: 0,
    left: 0,
  },
});
