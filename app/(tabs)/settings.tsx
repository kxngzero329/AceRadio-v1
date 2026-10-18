import { fonts } from "@/theme/fonts";
import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { PageScrollView } from "@/components/PageScrollView";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Bell,
  Timer,
  Link as LinkIcon,
  ChevronRight,
  Radio,
  MessageCircle,
  ShieldCheck,
  Mail,
  Info,
  Share2,
} from "lucide-react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SocialLinks } from "@/components/SocialLinks";
import { useAccountData } from "@/context/AccountDataContext";
import { AccountSyncStatus } from "@/components/AccountSyncStatus";
import { router } from "@/utils/navigation";
import { openVerifiedLink } from "@/services/links";
import { useRadio } from "@/context/RadioContext";
import { STATION } from "@/config/station";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import { typography } from "@/theme/typography";
import { PageHeading } from "@/components/PageHeading";
import { usePageContentStyle } from "@/hooks/usePageContentStyle";
const timerOptions = [null, 15, 30, 45, 60] as const;
export default function SettingsScreen() {
  const contentStyle = usePageContentStyle();
  const { fontScale } = useWindowDimensions();
  const {
    notificationsEnabled: notifications,
    setNotifications,
    canEdit,
    signedIn,
    displayName,
  } = useAccountData();
  const [busy, setBusy] = useState(false);
  const [shareNoticeVisible, setShareNoticeVisible] = useState(false);
  const { sleepMinutes, setSleepTimer } = useRadio();
  const updateNotifications = async (value: boolean) => {
    setBusy(true);
    try {
      await setNotifications(value);
      if (value) {
        Alert.alert(
          "Preference saved",
          signedIn
            ? "Show updates are coming soon. Your preference will sync with your account."
            : "Show updates are coming soon. Your preference is saved on this device.",
        );
      }
    } catch (e) {
      Alert.alert(
        "Notifications not ready",
        e instanceof Error ? e.message : "Unable to enable notifications.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <ScreenHeader />
      <PageScrollView
        testID="settings-scroll"
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
      >
        <PageHeading
          eyebrow="MAKE IT YOURS"
          title={
            <>
              Settings<Text style={{ color: colors.accent }}>.</Text>
            </>
          }
          subtitle="Tune AceRadio to your everyday."
        />
        <Text
          accessibilityRole="header"
          style={[styles.section, styles.firstSection]}
        >
          Account
        </Text>
        <View style={styles.panel}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              signedIn ? "Manage your account" : "Sign in or create an account"
            }
            onPress={() => router.push("/account")}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.icon}>
              <ShieldCheck size={20} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>
                {signedIn ? displayName : "Sign in or create an account"}
              </Text>
              <Text style={styles.rowSub}>
                {signedIn
                  ? "Manage your profile and account"
                  : "Keep favourites and preferences across devices"}
              </Text>
            </View>
            <ChevronRight size={19} color={colors.subtle} />
          </Pressable>
        </View>
        <View style={{ marginTop: 12 }}>
          <AccountSyncStatus style={styles.cardSurface} />
        </View>
        <Text accessibilityRole="header" style={styles.section}>
          Notifications
        </Text>
        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <Bell color={colors.accent} size={20} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Show & station updates</Text>
              <Text style={styles.rowSub}>
                Save your preference for future show updates
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator
                style={styles.switchLoading}
                color={colors.accent}
              />
            ) : (
              <Switch
                accessibilityLabel="Show and station updates preference"
                value={notifications}
                disabled={!canEdit}
                onValueChange={(v) => void updateNotifications(v)}
                trackColor={{ false: colors.borderStrong, true: colors.accent }}
                thumbColor={notifications ? colors.onAccent : colors.accentPressed}
                ios_backgroundColor={colors.borderStrong}
                {...(Platform.OS === "web" ? { activeThumbColor: colors.onAccent } : {})}
              />
            )}
          </View>
          <Text style={styles.notice}>
            Station notifications are coming soon.
          </Text>
        </View>
        <Text accessibilityRole="header" style={styles.section}>
          Playback
        </Text>
        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <Timer color={colors.accent} size={20} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Sleep timer</Text>
              <Text style={styles.rowSub}>
                Automatically pause live radio after a set time
              </Text>
            </View>
          </View>
          <View style={styles.pills}>
            {timerOptions.map((m) => (
              <Pressable
                key={m ?? "off"}
                accessibilityRole="button"
                accessibilityLabel={
                  m === null
                    ? "Turn off sleep timer"
                    : `Set sleep timer to ${m} minutes`
                }
                accessibilityState={{ selected: sleepMinutes === m }}
                {...(Platform.OS === "web"
                  ? { "aria-pressed": sleepMinutes === m }
                  : {})}
                onPress={() => setSleepTimer(m)}
                style={({ pressed }) => [
                  styles.pill,
                  { minWidth: 44 * Math.max(1, fontScale) },
                  sleepMinutes === m && styles.pillActive,
                  pressed && styles.pillPressed,
                ]}
              >
                <Text
                  style={[
                    styles.pillLabel,
                    sleepMinutes === m && styles.pillTextActive,
                  ]}
                >
                  {m === null ? "Off" : `${m}m`}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Text accessibilityRole="header" style={styles.section}>
          Connect with us
        </Text>
        <View style={styles.panel}>
          <Pressable
            testID="settings-share-app"
            accessibilityRole="button"
            accessibilityLabel="Share AceRadio"
            accessibilityHint="App sharing is coming soon, after the store launch."
            accessibilityState={{ expanded: shareNoticeVisible }}
            {...(Platform.OS === "web"
              ? { "aria-expanded": shareNoticeVisible }
              : {})}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => setShareNoticeVisible(true)}
          >
            <View style={styles.icon}>
              <Share2 size={20} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Share AceRadio</Text>
              <Text style={styles.rowSub}>Invite your friends · Coming soon</Text>
            </View>
            <ChevronRight size={19} color={colors.subtle} />
          </Pressable>
          {shareNoticeVisible && (
            <Text
              testID="settings-share-notice"
              style={styles.notice}
              accessibilityLiveRegion="polite"
            >
              App sharing will be available once AceRadio launches on Google Play
              and the App Store.
            </Text>
          )}
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => {
              void openVerifiedLink("WhatsApp", STATION.whatsapp);
            }}
          >
            <View style={styles.icon}>
              <MessageCircle size={20} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>WhatsApp</Text>
              <Text style={styles.rowSub}>Message the studio</Text>
            </View>
            <ChevronRight size={19} color={colors.subtle} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => {
              void openVerifiedLink("website", STATION.website);
            }}
          >
            <View style={styles.icon}>
              <LinkIcon size={20} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Official website</Text>
              <Text style={styles.rowSub}>
                {STATION.website.replace(/^https:\/\//, "")}
              </Text>
            </View>
            <ChevronRight size={19} color={colors.subtle} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() =>
              void openVerifiedLink("email", `mailto:${STATION.email}`)
            }
          >
            <View style={styles.icon}>
              <Mail size={20} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Studio email</Text>
              <Text style={styles.rowSub}>{STATION.email}</Text>
            </View>
            <ChevronRight size={19} color={colors.subtle} />
          </Pressable>
        </View>
        <Text accessibilityRole="header" style={styles.section}>
          Follow AceRadio
        </Text>
        <SocialLinks cardStyle={styles.cardSurface} />
        <Text accessibilityRole="header" style={styles.section}>
          App information
        </Text>
        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <Radio size={20} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Live stream</Text>
              <Text style={styles.rowSub}>
                {STATION.location ?? "Streaming live"}
              </Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.icon}>
              <ShieldCheck size={20} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Privacy-first listening</Text>
              <Text style={styles.rowSub}>No listener account required</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.icon}>
              <Info size={20} color={colors.accent} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>AceRadio</Text>
              <Text style={styles.rowSub}>Version 0.1.0</Text>
            </View>
          </View>
        </View>
        <Text style={styles.footer}>
          Made for people who listen differently.
        </Text>
      </PageScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  section: {
    marginTop: 24,
    marginBottom: 13,
    ...typography.sectionTitle,
  },
  firstSection: { marginTop: 0 },
  panel: {
    backgroundColor: colors.background,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  cardSurface: { backgroundColor: colors.background },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 76,
    paddingVertical: 16,
    borderRadius: layout.controlRadius,
  },
  icon: {
    backgroundColor: colors.accentSoft,
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: {
    color: colors.white,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.semibold,
  },
  rowSub: { ...typography.caption, marginTop: 4 },
  switchLoading: { width: 44 },
  pressed: { backgroundColor: colors.surface2 },
  pillPressed: { opacity: 0.75 },
  notice: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 2, fontFamily: fonts.regular,
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 6,
    paddingBottom: 16,
  },
  pill: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    flexGrow: 1,
    flexBasis: 44,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: { backgroundColor: colors.accent },
  pillLabel: {
    color: colors.white,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.semibold,
  },
  pillTextActive: { color: colors.onAccent },
  footer: {
    fontSize: 11,
    color: colors.subtle,
    textAlign: "center",
    marginTop: 28, fontFamily: fonts.medium,
  },
});
