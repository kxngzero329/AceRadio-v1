import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { usePushNotifications } from "@/context/PushNotificationContext";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
export function NotificationNotice() {
  const { notice, dismissNotice } = usePushNotifications();
  const insets = useSafeAreaInsets();
  if (!notice) return null;
  return <View testID="notification-notice" style={[styles.notice, { top: insets.top + 60 }]}>
    <Text style={styles.text} accessibilityLiveRegion="polite">{notice}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification message" onPress={dismissNotice} style={styles.close}><X size={18} color={colors.white} /></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  notice: { position: "absolute", zIndex: 100, left: 16, right: 16, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: colors.white, flex: 1 },
  close: { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
});
