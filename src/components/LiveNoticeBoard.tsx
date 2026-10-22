import { CachedImage as Image } from "@/components/CachedImage";
import { fonts } from "@/theme/fonts";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { ArrowUpRight, Bell, Radio } from "lucide-react-native";
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
import { usePushNotifications } from "@/context/PushNotificationContext";
import { useAccountData } from "@/context/AccountDataContext";
import { reminderKey } from "@/types/notifications";

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
      <ArrowUpRight size={18} color={colors.accent} />
    </Pressable>
  );
}

export function LiveNoticeBoard() {
  const { shows, loading, error } = useContent();
  const unavailable = !!error && !shows.length;
  const { liveShows } = useRadio();
  const next = getNextScheduledShow(shows);
  const push = usePushNotifications();
  const account = useAccountData();
  const occurrence = next ? reminderKey({ showId: next.show.id, startsAt: next.startsAt.toISOString() }) : null;
  const covered = !!next && push.enabled && (account.reminderScope === "all" || account.favorites.includes(next.show.id));
  const saved = push.oneTime.find(item => reminderKey(item) === occurrence);
  const remindMe = covered || !!saved;
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
          <Radio size={17} color={colors.accent} />
          <Text style={styles.headingText}>Live schedule</Text>
        </View>
        <View style={[styles.status, !liveShows.length && styles.statusOff]}>
          <View style={[styles.dot, !liveShows.length && styles.dotOff]} />
          <Text style={[styles.statusText, !liveShows.length && styles.statusTextOff]}>
            {liveShows.length ? "ON AIR" : loading ? "UPDATING" : "LIVE RADIO"}
          </Text>
        </View>
      </View>

      <Text accessibilityRole="header" style={styles.sectionLabel}>Live right now</Text>
      {liveShows.length ? (
        <View style={styles.list}>
          {liveShows.map((show) => (
            <ShowNotice key={show.id} show={show} detail={show.schedule} />
          ))}
        </View>
      ) : (
        loading ? <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.offAirDescription}>Checking who’s on air…</Text>
        </View> : <Pressable
          testID="schedule-station-live"
          accessibilityRole="button"
          accessibilityLabel="Open AceRadio live player"
          onPress={() => router.navigate("/player")}
          style={({ pressed }) => [styles.show, pressed && styles.pressed]}
        >
          <Image source={require("../../assets/icons/icon.png")} style={styles.artwork} resizeMode="contain" accessible={false} />
          <View style={styles.showCopy}>
            <Text style={styles.showTitle}>AceRadio</Text>
            <Text style={styles.presenter}>Live radio, around the clock</Text>
            <Text style={styles.schedule}>{unavailable ? "Schedule temporarily unavailable" : "Live music between shows"}</Text>
          </View>
          <ArrowUpRight size={18} color={colors.accent} />
        </Pressable>
      )}
      <View testID="schedule-up-next" style={styles.nextSection}>
        <Text accessibilityRole="header" style={styles.nextLabel}>Coming up next</Text>
        {next ? <ShowNotice show={next.show} detail={`${nextTime} SAST`} /> : (
          <Text style={styles.offAirDescription}>
            {loading ? "Checking the next show…" : unavailable ? "The next show will appear when the schedule is available." : "Check back for the next broadcast."}
          </Text>
        )}
        <View style={styles.reminder}>
          <Bell size={17} color={colors.muted} />
          <View style={styles.reminderCopy}>
            <Text style={styles.reminderTitle}>Remind me</Text>
            <Text style={styles.reminderHint} accessibilityLiveRegion="polite">
              {!next ? "No upcoming show to remind you about." : push.unsupported ? "Reminders need an installed AceRadio build." : (covered || saved) && !push.deliveryActive ? push.status : covered ? "Included in your show reminder settings." : saved ? (saved.leadMinutes ? `Reminder saved · ${saved.leadMinutes} minutes before.` : "Reminder saved · at the start.") : "A one-time reminder for this broadcast."}
            </Text>
          </View>
          <Switch
            testID="schedule-reminder-switch"
            accessibilityLabel="Remind me about the next show"
            accessibilityHint={covered ? "This show is included in your reminder settings." : "Save or remove a reminder for this broadcast only."}
            value={remindMe}
            disabled={!next || !push.ready || push.busy || push.unsupported || covered}
            onValueChange={value => { if (next) void push.setOneTime(next.show.id, next.startsAt.toISOString(), value).catch(error => Alert.alert("Show reminder", error instanceof Error ? error.message : "Couldn't save your reminder.")); }}
            trackColor={{ false: colors.borderStrong, true: colors.accent }}
            thumbColor={remindMe ? colors.onAccent : colors.accentPressed}
            ios_backgroundColor={colors.borderStrong}
            {...(Platform.OS === "web" ? { activeThumbColor: colors.onAccent } : {})}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
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
    fontFamily: fonts.displayBold,
  },
  status: {
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  statusOff: { backgroundColor: colors.surface2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  dotOff: { backgroundColor: colors.subtle },
  statusText: {
    color: colors.accent,
    fontSize: 9,
    fontFamily: fonts.semibold,
    letterSpacing: 0.7,
  },
  statusTextOff: { color: colors.muted },
  list: { gap: 8, marginTop: 14 },
  sectionLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.semibold, marginTop: 16 },
  nextLabel: { color: colors.muted, fontSize: 12, fontFamily: fonts.semibold, marginBottom: 4 },
  nextSection: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 14, marginTop: 10 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 18 },
  offAirDescription: { color: colors.muted, fontSize: 12, lineHeight: 18, paddingVertical: 6, fontFamily: fonts.regular },
  reminder: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 60, marginTop: 4, paddingTop: 8 },
  reminderCopy: { flex: 1, minWidth: 0, gap: 4 },
  reminderTitle: { color: colors.white, fontSize: 13, fontFamily: fonts.semibold },
  reminderHint: { color: colors.subtle, fontSize: 11, lineHeight: 16, fontFamily: fonts.medium },
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
  showTitle: { color: colors.white, fontSize: 17, lineHeight: 23, fontFamily: fonts.displayBold },
  presenter: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3, fontFamily: fonts.medium },
  schedule: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5, fontFamily: fonts.medium },
});
