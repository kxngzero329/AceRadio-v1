import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useUpcomingEvents } from "@/hooks/useStationEvents";
import { EventCard } from "@/components/EventCard";
import { EventsStatus } from "@/components/EventsStatus";
import { SectionTitle } from "@/components/SectionTitle";
import { router } from "@/utils/navigation";
import { layout } from "@/theme/layout";

export function UpcomingEvents() {
  const state = useUpcomingEvents();
  const [width, setWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  if (!state.loading && !state.error && !state.events.length) return null;
  const columns =
    width >= 560 && fontScale <= 1.35 && state.events.length > 1 ? 2 : 1;
  const cardWidth = (width - 12 * (columns - 1)) / columns;
  return (
    <View
      testID="upcoming-events"
      style={styles.root}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <SectionTitle
        title="Upcoming events"
        action={state.events.length > 1 ? "See all" : undefined}
        onPress={() => router.push("/events")}
      />
      <EventsStatus {...state} />
      {width > 12 && state.events.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.cards}
          decelerationRate="fast"
          snapToInterval={cardWidth + 12}
        >
          {state.events.slice(0, 6).map((event) => (
            <EventCard
              key={event.id}
              event={event}
              now={state.now}
              width={cardWidth}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { marginBottom: layout.sectionGap },
  scroll: { flexGrow: 0, flexShrink: 0 },
  cards: { flexDirection: "row", alignItems: "stretch", gap: 12 },
});
