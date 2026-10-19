import { StyleSheet, Text, View } from "react-native";
import { CalendarDays } from "lucide-react-native";
import { ContentSheet } from "@/components/ContentSheet";
import { EventCard } from "@/components/EventCard";
import { EventsStatus } from "@/components/EventsStatus";
import { useUpcomingEvents } from "@/hooks/useStationEvents";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";

export default function EventsScreen() {
  const state = useUpcomingEvents();
  return (
    <ContentSheet title="Events" testID="events-sheet">
      <Text accessibilityRole="header" style={typography.pageTitle}>
        Upcoming events
      </Text>
      <Text style={styles.subtitle}>
        Dates and times are shown in South Africa (SAST).
      </Text>
      <EventsStatus {...state} />
      <View style={styles.list}>
        {state.events.map((event) => (
          <EventCard key={event.id} event={event} now={state.now} />
        ))}
      </View>
      {!state.loading && !state.error && !state.events.length && (
        <View testID="events-empty" style={styles.empty}>
          <CalendarDays size={32} color={colors.subtle} />
          <Text style={typography.sectionTitle}>
            Nothing on the calendar yet
          </Text>
          <Text style={styles.emptyText}>
            Upcoming AceRadio events will appear here when they’re announced.
          </Text>
        </View>
      )}
    </ContentSheet>
  );
}
const styles = StyleSheet.create({
  subtitle: { ...typography.body, marginTop: 8, marginBottom: 24 },
  list: { gap: 16 },
  empty: { paddingVertical: 32, alignItems: "center", gap: 14 },
  emptyText: { ...typography.body, textAlign: "center" },
});
