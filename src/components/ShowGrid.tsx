import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ShowCard } from "@/components/ShowCard";
import type { Show } from "@/types/show";

export function ShowGrid({ shows }: { shows: Show[] }) {
  const [width, setWidth] = useState(0);
  const columns = width >= 680 ? 3 : 2;
  const cardWidth = (width - 12 * (columns - 1)) / columns;

  return (
    <View
      testID="show-grid"
      style={styles.grid}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 &&
        shows.map((show) => (
          <ShowCard key={show.id} show={show} width={cardWidth} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
