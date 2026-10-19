import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react-native";
import { EventArtwork } from "@/components/EventArtwork";
import { router } from "@/utils/navigation";
import { eventPhase, eventSchedule } from "@/utils/events";
import type { StationEvent } from "@/types/content";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { layout } from "@/theme/layout";

export const EventCard = memo(function EventCard({
  event,
  now,
  width,
}: {
  event: StationEvent;
  now: number;
  width?: number;
}) {
  const schedule = eventSchedule(event);
  const live = eventPhase(event, now) === "live";
  return (
    <Pressable
      testID={`event-card-${event.id}`}
      accessibilityRole="button"
      accessibilityLabel={`View ${event.title}. ${schedule}${event.location ? `. ${event.location}` : ""}`}
      onPress={() =>
        router.push({ pathname: "/event/[id]", params: { id: event.id } })
      }
      style={({ pressed }) => [
        styles.card,
        width !== undefined && { width },
        pressed && styles.pressed,
      ]}
    >
      {event.imageUrl && (
        <EventArtwork uri={event.imageUrl} title={event.title} />
      )}
      <View style={styles.body}>
        <Text style={styles.overline}>
          {live ? "HAPPENING NOW" : "UPCOMING EVENT"}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={styles.row}>
          <CalendarDays color={colors.muted} size={16} />
          <Text style={styles.meta}>{schedule}</Text>
        </View>
        {event.location && (
          <View style={styles.row}>
            <MapPin color={colors.muted} size={16} />
            <Text style={styles.meta} numberOfLines={2}>
              {event.location}
            </Text>
          </View>
        )}
        <View style={styles.footer}>
          <Text style={styles.action}>View event</Text>
          <ArrowUpRight size={16} color={colors.white} />
        </View>
      </View>
    </Pressable>
  );
});
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  body: { padding: 16 },
  overline: {
    color: colors.subtle,
    fontFamily: fonts.semibold,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1,
  },
  title: {
    color: colors.white,
    fontFamily: fonts.displayBold,
    fontSize: 20,
    lineHeight: 26,
    marginTop: 5,
    marginBottom: 12,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 6 },
  meta: {
    flex: 1,
    color: colors.muted,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 14,
  },
  action: {
    color: colors.white,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.semibold,
  },
  pressed: { backgroundColor: colors.surface2, opacity: 0.85 },
});
