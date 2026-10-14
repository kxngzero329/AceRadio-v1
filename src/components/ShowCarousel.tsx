import { memo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ShowCard } from "@/components/ShowCard";
import type { Show } from "@/types/show";

export const ShowCarousel = memo(function ShowCarousel({
  shows,
}: {
  shows: Show[];
}) {
  const [width, setWidth] = useState(0);
  const cardWidth = (width - 12) / 2;

  return (
    <View
      testID="show-carousel"
      style={styles.root}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 12 && (
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
  content: { gap: 12, alignItems: "stretch" },
});
