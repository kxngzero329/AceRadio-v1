import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowUpRight, Clock3, Radio } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { useRadio } from "@/context/RadioContext";
import { useContent } from "@/context/ContentContext";
import {
  getNextScheduledShow,
  SAST_TIME_ZONE,
} from "@/utils/showSchedule";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import type { Show } from "@/types/show";

function ShowNotice({ show, detail }: { show: Show; detail: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${show.title}, presented by ${show.presenter}. ${detail}`}
      onPress={() =>
        router.push({ pathname: "/show/[id]", params: { id: show.id } })
      }
      style={({ pressed }) => [styles.show, pressed && styles.pressed]}
    >
      {show.image || show.poster ? <Image source={show.image ?? show.poster} style={styles.artwork} accessibilityLabel={show.presenter} /> : <View style={[styles.artwork, styles.artworkPlaceholder]}><Radio size={24} color={colors.muted} /></View>}
      <View style={styles.showCopy}>
        <Text style={styles.showTitle} numberOfLines={2}>
          {show.title}
        </Text>
        <Text style={styles.presenter} numberOfLines={2}>
          {show.presenter}
        </Text>
        <Text style={styles.schedule} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <ArrowUpRight size={18} color={colors.green} />
    </Pressable>
  );
}

export function LiveNoticeBoard() {
  const { shows, loading, error } = useContent();
  const unavailable = !!error && !shows.length;
  const { liveShows } = useRadio();
  const next = liveShows.length ? null : getNextScheduledShow(shows);
  const nextTime = next
    ? new Intl.DateTimeFormat("en-ZA", {
        timeZone: SAST_TIME_ZONE,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(next.startsAt)
    : null;

  return (
    <View
      testID="live-notice-board"
      style={styles.board}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <Radio size={17} color={colors.green} />
          <Text style={styles.headingText}>Live schedule</Text>
        </View>
        <View style={[styles.status, !liveShows.length && styles.statusOff]}>
          <View style={[styles.dot, !liveShows.length && styles.dotOff]} />
          <Text style={[styles.statusText, !liveShows.length && styles.statusTextOff]}>
            {liveShows.length ? "ON AIR" : loading ? "UPDATING" : unavailable ? "UNAVAILABLE" : next ? "UP NEXT" : "LIVE MUSIC"}
          </Text>
        </View>
      </View>

      {liveShows.length ? (
        <View style={styles.list}>
          {liveShows.map((show) => (
            <ShowNotice key={show.id} show={show} detail={show.schedule} />
          ))}
        </View>
      ) : (
        <View style={styles.offAir}>
          <View style={styles.offAirCopy} accessibilityLiveRegion="polite">
            {loading && <ActivityIndicator size="small" color={colors.green} />}
            <Text style={styles.offAirTitle}>
              {loading ? "Checking the schedule…" : unavailable ? "Schedule unavailable" : next ? "Live music between shows" : "No shows scheduled"}
            </Text>
            <Text style={styles.offAirDescription}>
              {loading || unavailable ? "You can still listen to the live station." : next ? "Here’s what’s coming up next." : "Check back for the next broadcast."}
            </Text>
          </View>
          {next ? (
            <ShowNotice
              show={next.show}
              detail={`Next up · ${nextTime} SAST`}
            />
          ) : null}
        </View>
      )}
      <View style={styles.timezone}><Clock3 size={11} color={colors.subtle} /><Text style={styles.timezoneText}>All times in South Africa · SAST</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    marginBottom: 14,
    overflow: "hidden",
  },
  header: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  headingText: {
    flexShrink: 1,
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
  },
  status: {
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.greenDeep,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusOff: { backgroundColor: colors.surface2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  dotOff: { backgroundColor: colors.subtle },
  statusText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  statusTextOff: { color: colors.muted },
  list: { gap: 8, marginTop: 14 },
  offAir: { marginTop: 13 },
  offAirCopy: { marginBottom: 12, gap: 4 },
  offAirTitle: { color: colors.white, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  offAirDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  timezone: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
  timezoneText: { color: colors.subtle, fontSize: 11, lineHeight: 16 },
  show: {
    minHeight: 84,
    borderRadius: 12,
    paddingHorizontal: 0,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pressed: { opacity: 0.7, backgroundColor: colors.surface2 },
  artwork: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.surface2,
  },
  showCopy: { flex: 1, minWidth: 0 },
  artworkPlaceholder: { alignItems: "center", justifyContent: "center" },
  showTitle: { color: colors.white, fontSize: 17, lineHeight: 23, fontWeight: "700" },
  presenter: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  schedule: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
});
