import { memo, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { colors } from "@/theme/colors";
import { ShowCard } from "@/components/ShowCard";
import type { Show } from "@/types/show";

export const ShowCarousel = memo(function ShowCarousel({
  shows,
  loading = false,
}: {
  shows: Show[];
  loading?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const columns = fontScale > 1.35 ? 1 : width >= 560 ? 3 : 2;
  const cardWidth = (width - 12 * (columns - 1)) / columns;

  return (
    <View
      testID="show-carousel"
      style={styles.root}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 12 && loading ? <View style={styles.content} accessible accessibilityLabel="Loading shows" accessibilityState={{ busy: true }}>
        {Array.from({ length: columns }, (_, index) => <View key={index} style={[styles.skeleton, { width: cardWidth }]}>
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonBody}><View style={styles.skeletonTitle} /><View style={styles.skeletonLine} /><View style={[styles.skeletonLine, { width: "60%" }]} /></View>
        </View>)}
      </View> : width > 12 && (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={cardWidth + 12}
          style={styles.scroll}
          contentContainerStyle={styles.content}
        >
          {shows.map((show) => (
            <ShowCard key={show.id} show={show} width={cardWidth} />
          ))}
        </ScrollView>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { width: "100%" },
  scroll: { flexGrow: 0, flexShrink: 0 },
  content: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  skeleton: { borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface },
  skeletonImage: { width: "100%", aspectRatio: 1, backgroundColor: colors.surface2 },
  skeletonBody: { padding: 12, gap: 12, minHeight: 148 },
  skeletonTitle: { height: 16, width: "85%", borderRadius: 4, backgroundColor: colors.border },
  skeletonLine: { height: 12, width: "75%", borderRadius: 4, backgroundColor: colors.surface2 },
});
