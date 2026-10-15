import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowUpRight, Clock3, Radio } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "@/utils/navigation";
import { useRadio } from "@/context/RadioContext";
import { useContent } from "@/context/ContentContext";
import {
  getNextScheduledShow,
  SAST_TIME_ZONE,
} from "@/utils/showSchedule";
import { colors } from "@/theme/colors";
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
      <Image source={show.image ?? show.poster} style={styles.artwork} />
      <View style={styles.showCopy}>
        <Text style={styles.showTitle} numberOfLines={1}>
          {show.title}
        </Text>
        <Text style={styles.presenter} numberOfLines={1}>
          {show.presenter}
        </Text>
        <Text style={styles.schedule} numberOfLines={1}>
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
    <LinearGradient
      testID="live-notice-board"
      colors={["#13291C", "#0C1710"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.board}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <Radio size={17} color={colors.green} />
          <Text style={styles.headingText}>SCHEDULES</Text>
        </View>
        <View style={[styles.status, !liveShows.length && styles.statusOff]}>
          <View style={[styles.dot, !liveShows.length && styles.dotOff]} />
          <Text style={[styles.statusText, !liveShows.length && styles.statusTextOff]}>
            {liveShows.length ? "LIVE NOW" : loading ? "UPDATING" : unavailable ? "UNAVAILABLE" : "OFF AIR"}
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
          <View style={styles.offAirCopy}>
            <Text style={styles.offAirTitle}>
              {loading ? "Checking the schedule…" : unavailable ? "Schedule unavailable" : next ? "Between shows" : "No shows scheduled"}
            </Text>
            <Text style={styles.offAirDescription}>
              {loading || unavailable ? "You can still listen to the live station." : next ? "Here’s what’s coming up next." : "Check back for the next broadcast."}
            </Text>
          </View>
          {next && nextTime ? (
            <View style={styles.nextUp}>
              <Clock3 size={14} color={colors.green} />
              <Text style={styles.nextTime}>{nextTime} SAST</Text>
            </View>
          ) : null}
          {next ? (
            <ShowNotice
              show={next.show}
              detail={`Next up · ${nextTime} SAST`}
            />
          ) : null}
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  board: {
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#285238",
    padding: 16,
    marginBottom: 22,
    overflow: "hidden",
  },
  header: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  headingText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  status: {
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#1D442B",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusOff: { backgroundColor: "#202922" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  dotOff: { backgroundColor: colors.subtle },
  statusText: {
    color: colors.green,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  statusTextOff: { color: colors.muted },
  list: { gap: 8, marginTop: 14 },
  offAir: { marginTop: 13 },
  offAirCopy: { marginBottom: 12 },
  offAirTitle: { color: colors.white, fontSize: 17, fontWeight: "800" },
  offAirDescription: { color: colors.muted, fontSize: 12, marginTop: 4 },
  nextUp: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  nextTime: { color: colors.green, fontSize: 10, fontWeight: "800" },
  show: {
    minHeight: 68,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#09130D",
    borderWidth: 1,
    borderColor: "#223A2A",
  },
  pressed: { opacity: 0.78 },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  showCopy: { flex: 1, minWidth: 0 },
  showTitle: { color: colors.white, fontSize: 13, fontWeight: "800" },
  presenter: { color: "#D8E0DA", fontSize: 11, marginTop: 3 },
  schedule: { color: colors.muted, fontSize: 10, marginTop: 3 },
});
