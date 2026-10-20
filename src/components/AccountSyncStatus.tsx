import { fonts } from "@/theme/fonts";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { router } from "@/utils/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAccountData } from "@/context/AccountDataContext";
import { colors } from "@/theme/colors";

export function AccountSyncStatus({
  showGuest = false,
  style,
}: {
  showGuest?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const auth = useAuth();
  const data = useAccountData();
  if (auth.loading)
    return (
      <View style={[styles.box, style]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.text}>Restoring your account…</Text>
      </View>
    );
  if (!data.signedIn && !showGuest && !data.error) return null;
  return (
    <View
      testID="account-sync-status"
      role="status"
      style={[styles.box, style]}
      accessibilityLiveRegion="polite"
    >
      {data.syncing && <ActivityIndicator size="small" color={colors.accent} />}
      <View style={styles.copy}>
        <Text style={styles.text}>
          {data.error ??
            (data.signedIn
              ? data.transferringGuest
                ? "Adding your device favourites…"
                : data.pending
                  ? `${data.pending} ${data.pending === 1 ? "change" : "changes"} waiting to sync`
                  : data.syncing
                    ? "Syncing your account…"
                    : data.lastSynced
                      ? "Saved to your account"
                      : "Your saved account data is available on this device."
              : "Sign in to keep your favourites and preferences across devices.")}
        </Text>
        {data.notice && <Text style={styles.text}>{data.notice}</Text>}
      </View>
      {data.signedIn ? (
        (data.error || data.pending > 0) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry account sync"
            disabled={data.syncing}
            onPress={() => void data.refresh()}
            style={styles.action}
          >
            <Text style={styles.link}>Retry</Text>
          </Pressable>
        )
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/account")}
          style={styles.action}
        >
          <Text style={styles.link}>Sign in</Text>
        </Pressable>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copy: { flex: 1, gap: 6 },
  text: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  action: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  link: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 },
});
