import { memo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { ShowCardSkeleton } from "@/components/ShowCardSkeleton";
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
      {width > 12 && loading ? (
        <View
          style={styles.content}
          accessible
          accessibilityLabel="Loading shows"
          accessibilityState={{ busy: true }}
          aria-busy
        >
          {Array.from({ length: columns }, (_, index) => (
            <ShowCardSkeleton key={index} width={cardWidth} />
          ))}
        </View>
      ) : (
        width > 12 && (
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
        )
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { width: "100%" },
  scroll: { flexGrow: 0, flexShrink: 0 },
  content: { flexDirection: "row", gap: 12, alignItems: "stretch" },
});
