import { useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Bell } from "lucide-react-native";
import { useAccountData } from "@/context/AccountDataContext";
import { usePushNotifications } from "@/context/PushNotificationContext";
import type { ReminderLead, ReminderScope } from "@/types/notifications";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { layout } from "@/theme/layout";

export function NotificationSettings() {
  const push = usePushNotifications();
  const account = useAccountData();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const report = (error: unknown) => Alert.alert("Show reminders", error instanceof Error ? error.message : "Couldn't save that choice. Please try again.");
  const disabled = !push.ready || push.busy || saving || !account.canEdit;
  const choose = async (scope: ReminderScope, lead: ReminderLead) => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { await account.setReminderOptions(scope, lead); }
    catch (error) { report(error); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <View testID="notification-settings" style={styles.panel}>
    <View style={styles.row}>
      <Bell size={20} color={colors.white} />
      <View style={styles.copy}>
        <Text style={styles.title}>Show reminders</Text>
        <Text style={styles.hint}>Never miss the shows you love.</Text>
      </View>
      <Switch testID="notifications-switch" accessibilityLabel="Enable show reminders"
        accessibilityState={{ busy: push.busy }} value={push.enabled} disabled={disabled || push.unsupported}
        onValueChange={value => void push.setEnabled(value).catch(report)}
        trackColor={{ false: colors.borderStrong, true: colors.accent }} thumbColor={push.enabled ? colors.onAccent : colors.accentPressed} ios_backgroundColor={colors.borderStrong} />
    </View>
    <Text style={styles.label}>Notify me about</Text>
    <View style={styles.options}>
      {([['favorites', 'My favourites'], ['all', 'Every show']] as const).map(([scope, label]) => <Pressable key={scope}
        accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: account.reminderScope === scope, disabled }}
        {...(Platform.OS === "web" ? { "aria-pressed": account.reminderScope === scope } : {})}
        disabled={disabled} onPress={() => choose(scope, account.reminderLeadMinutes)}
        style={[styles.option, account.reminderScope === scope && styles.selected]}>
        <Text style={[styles.optionText, account.reminderScope === scope && styles.selectedText]}>{label}</Text>
      </Pressable>)}
    </View>
    <Text style={styles.label}>Remind me</Text>
    <View style={styles.options}>
      {([0, 5, 10, 15] as const).map(lead => <Pressable key={lead}
        accessibilityRole="button" accessibilityLabel={lead ? `${lead} minutes before the show` : "At the start of the show"}
        accessibilityState={{ selected: account.reminderLeadMinutes === lead, disabled }} disabled={disabled}
        {...(Platform.OS === "web" ? { "aria-pressed": account.reminderLeadMinutes === lead } : {})}
        onPress={() => choose(account.reminderScope, lead)} style={[styles.option, account.reminderLeadMinutes === lead && styles.selected]}>
        <Text style={[styles.optionText, account.reminderLeadMinutes === lead && styles.selectedText]}>{lead ? `${lead} min before` : "At start"}</Text>
      </Pressable>)}
    </View>
    <Text testID="notification-status" style={styles.hint} accessibilityLiveRegion="polite">{push.status}</Text>
    <Text style={styles.small}>Guest choices stay on this phone. With an account, show choices and recurring on/off sync across devices. Each phone needs notification permission.</Text>
    {push.blocked ? <Pressable accessibilityRole="button" onPress={() => void push.openSettings().catch(report)} style={styles.link}><Text style={styles.linkText}>Open phone settings</Text></Pressable> :
      !push.unsupported && <Pressable accessibilityRole="button" disabled={push.busy || push.syncing} onPress={push.refresh} style={styles.link}><Text style={styles.linkText}>Refresh notification status</Text></Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { padding: 16, borderRadius: layout.cardRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: fonts.semibold, fontSize: 14, color: colors.white },
  hint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.muted },
  small: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, color: colors.subtle },
  label: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white, marginTop: 4 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 12, justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: layout.controlRadius },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.white },
  selectedText: { color: colors.onAccent },
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  linkText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 12, textDecorationLine: "underline" },
});
