import { useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { ShowCard } from "@/components/ShowCard";
import { ShowCardSkeleton } from "@/components/ShowCardSkeleton";
import type { Show } from "@/types/show";

export function ShowGrid({
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
      testID="show-grid"
      style={styles.grid}
      accessible={loading}
      accessibilityLabel={loading ? "Loading shows" : undefined}
      accessibilityState={loading ? { busy: true } : undefined}
      aria-busy={loading || undefined}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 12 && loading
        ? Array.from({ length: columns }, (_, index) => (
            <ShowCardSkeleton key={index} width={cardWidth} />
          ))
        : width > 12 &&
          shows.map((show) => (
            <ShowCard key={show.id} show={show} width={cardWidth} />
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
