import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { CalendarDays, MapPin } from "lucide-react-native";
import { ContentSheet } from "@/components/ContentSheet";
import { EventArtwork } from "@/components/EventArtwork";
import { EventsStatus } from "@/components/EventsStatus";
import { ExternalContentButton } from "@/components/ExternalContentButton";
import { STATION } from "@/config/station";
import { useStationEvent } from "@/hooks/useStationEvents";
import { eventPhase, eventSchedule } from "@/utils/events";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { layout } from "@/theme/layout";
import { typography } from "@/theme/typography";

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useStationEvent(typeof id === "string" ? id : "");
  const event = state.event;
  const phase = event ? eventPhase(event, state.now) : null;
  return (
    <ContentSheet title="Event details" testID="event-detail-sheet">
      <EventsStatus {...state} />
      {event ? (
        <>
          {event.imageUrl && (
            <View style={styles.artwork}>
              <EventArtwork uri={event.imageUrl} title={event.title} detail />
            </View>
          )}
          <Text style={styles.overline}>
            {phase === "live"
              ? "HAPPENING NOW"
              : phase === "past"
                ? "PAST EVENT"
                : "UPCOMING EVENT"}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            {event.title}
          </Text>
          <View style={styles.info}>
            <View style={styles.row}>
              <CalendarDays size={20} color={colors.white} />
              <View style={styles.copy}>
                <Text style={styles.label}>Date & time</Text>
                <Text testID="event-schedule" style={styles.value}>
                  {eventSchedule(event)}
                </Text>
              </View>
            </View>
            {event.location && (
              <View style={styles.row}>
                <MapPin size={20} color={colors.white} />
                <View style={styles.copy}>
                  <Text style={styles.label}>Location</Text>
                  <Text style={styles.value}>{event.location}</Text>
                </View>
              </View>
            )}
          </View>
          {phase !== "past" && (
            <ExternalContentButton
              label="Book on the Website"
              url={STATION.bookings}
            />
          )}
          {event.description.trim() && (
            <View style={styles.about}>
              <Text accessibilityRole="header" style={typography.sectionTitle}>
                About the event
              </Text>
              <Text selectable style={styles.description}>
                {event.description}
              </Text>
            </View>
          )}
        </>
      ) : (
        !state.loading &&
        !state.error && (
          <View testID="event-unavailable" style={styles.empty}>
            <CalendarDays size={36} color={colors.subtle} />
            <Text accessibilityRole="header" style={typography.sectionTitle}>
              Event unavailable
            </Text>
            <Text style={styles.emptyText}>
              This event may no longer be published. Head back to explore
              upcoming events.
            </Text>
          </View>
        )
      )}
    </ContentSheet>
  );
}
const styles = StyleSheet.create({
  artwork: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 22,
  },
  overline: { ...typography.eyebrow, marginTop: 4 },
  title: { ...typography.pageTitle, marginTop: 8 },
  info: {
    marginTop: 22,
    padding: 16,
    gap: 20,
    backgroundColor: colors.surface,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  copy: { flex: 1, gap: 5 },
  label: { ...typography.caption, color: colors.subtle },
  value: {
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 22,
  },
  about: {
    marginTop: 26,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  description: { ...typography.body, marginTop: 12 },
  empty: { alignItems: "center", paddingVertical: 32, gap: 14 },
  emptyText: { ...typography.body, textAlign: "center" },
});
