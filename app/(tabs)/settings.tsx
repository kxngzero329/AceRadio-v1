import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
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
} from "lucide-react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SocialLinks } from "@/components/SocialLinks";
import {
  getNotificationsEnabled,
  enableNotifications,
  disableNotifications,
} from "@/services/notifications";
import { openVerifiedLink } from "@/services/links";
import { useRadio } from "@/context/RadioContext";
import { STATION } from "@/config/station";
import { colors } from "@/theme/colors";
const timerOptions = [null, 15, 30, 45, 60] as const;
export default function SettingsScreen() {
  const [notifications, setNotifications] = useState(false);
  const [busy, setBusy] = useState(false);
  const { sleepMinutes, setSleepTimer } = useRadio();
  useEffect(() => {
    getNotificationsEnabled().then(setNotifications).catch(console.warn);
  }, []);
  const updateNotifications = async (value: boolean) => {
    setBusy(true);
    try {
      if (value) {
        await enableNotifications();
        setNotifications(true);
        Alert.alert(
          "Preference saved",
          "Show updates are coming soon. Your preference is saved on this device for this preview.",
        );
      } else {
        await disableNotifications();
        setNotifications(false);
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
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>MAKE IT YOURS</Text>
        <Text style={styles.title}>
          Settings<Text style={{ color: colors.green }}>.</Text>
        </Text>
        <Text style={styles.sub}>Tune AceRadio to your everyday.</Text>
        <Text style={styles.section}>NOTIFICATIONS</Text>
        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <Bell color={colors.green} size={20} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Show & station updates</Text>
              <Text style={styles.rowSub}>Get notified when your favourite shows are live</Text>
            </View>
            {busy ? (
              <ActivityIndicator color={colors.green} />
            ) : (
              <Switch
                accessibilityLabel="Demo notification preference"
                value={notifications}
                onValueChange={(v) => void updateNotifications(v)}
                trackColor={{ false: "#2D3D33", true: "#286C43" }}
                thumbColor={notifications ? colors.green : "#C2C9C4"}
              />
            )}
          </View>
          <Text style={styles.notice}>
            Station notifications are coming soon.
          </Text>
        </View>
        <Text style={styles.section}>PLAYBACK</Text>
        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <Timer color={colors.green} size={20} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Sleep timer</Text>
              <Text style={styles.rowSub}>Automatically pause live radio after a set time</Text>
            </View>
          </View>
          <View style={styles.pills}>
            {timerOptions.map((m) => (
              <Pressable
                key={m ?? "off"}
                onPress={() => setSleepTimer(m)}
                style={[styles.pill, sleepMinutes === m && styles.pillActive]}
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
        <Text style={styles.section}>CONNECT WITH US</Text>
        <View style={styles.panel}>
          <Pressable
            style={styles.row}
            onPress={() => { void openVerifiedLink("WhatsApp", STATION.whatsapp); }}
          >
            <View style={styles.icon}>
              <MessageCircle size={20} color={colors.green} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>WhatsApp</Text>
              <Text style={styles.rowSub}>Message the studio</Text>
            </View>
            <ChevronRight size={19} color={colors.subtle} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={styles.row}
            onPress={() => { void openVerifiedLink("website", STATION.website); }}
          >
            <View style={styles.icon}>
              <LinkIcon size={20} color={colors.green} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Official website</Text>
              <Text style={styles.rowSub}>{STATION.website.replace(/^https:\/\//, "")}</Text>
            </View>
            <ChevronRight size={19} color={colors.subtle} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={styles.row}
            onPress={() =>
              void openVerifiedLink("email", `mailto:${STATION.email}`)
            }
          >
            <View style={styles.icon}>
              <Mail size={20} color={colors.green} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Studio email</Text>
              <Text style={styles.rowSub}>{STATION.email}</Text>
            </View>
            <ChevronRight size={19} color={colors.subtle} />
          </Pressable>
        </View>
        <Text style={[styles.section, { marginBottom: 14 }]}>
          FOLLOW ACE RADIO
        </Text>
        <SocialLinks />
        <Text style={styles.section}>APP INFORMATION</Text>
        <View style={styles.panel}>
          <View style={styles.row}>
            <View style={styles.icon}>
              <Radio size={20} color={colors.green} />
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
              <ShieldCheck size={20} color={colors.green} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>Privacy-first listening</Text>
              <Text style={styles.rowSub}>No listener account required</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.icon}>
              <Info size={20} color={colors.green} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowName}>AceRadio</Text>
              <Text style={styles.rowSub}>
                Version 0.1.0
              </Text>
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
  content: { paddingHorizontal: 20, paddingBottom: 180 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.green,
    marginTop: 14,
  },
  title: {
    color: colors.white,
    fontWeight: "900",
    fontSize: 37,
    letterSpacing: -1.2,
    marginTop: 8,
  },
  sub: { fontSize: 14, color: colors.muted, marginTop: 5 },
  section: {
    marginTop: 28,
    marginBottom: 13,
    fontSize: 11,
    color: colors.green,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 15,
    paddingVertical: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 73 },
  icon: {
    backgroundColor: "#143422",
    height: 40,
    width: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1 },
  rowName: { color: colors.white, fontSize: 13, fontWeight: "800" },
  rowSub: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  notice: {
    color: colors.subtle,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 52 },
  pills: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 7,
    paddingBottom: 16,
  },
  pill: {
    paddingVertical: 9,
    flex: 1,
    borderRadius: 9,
    backgroundColor: "#223027",
    alignItems: "center",
  },
  pillActive: { backgroundColor: colors.green },
  pillLabel: { color: colors.white, fontSize: 12, fontWeight: "800" },
  pillTextActive: { color: colors.background },
  footer: {
    fontSize: 11,
    color: colors.subtle,
    textAlign: "center",
    marginTop: 28,
  },
});
