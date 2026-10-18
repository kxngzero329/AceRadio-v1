import { fonts } from "@/theme/fonts";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useContent } from "@/context/ContentContext";
import { colors } from "@/theme/colors";

export function ContentStatus({
  emptyMessage,
  showLoading = true,
}: {
  emptyMessage?: string;
  showLoading?: boolean;
}) {
  const { loading, error, shows, refresh, refreshing } = useContent();
  if (loading && !shows.length)
    return showLoading ? (
      <View style={styles.box} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.text}>Loading station content…</Text>
      </View>
    ) : null;
  if (error)
    return (
      <View style={styles.box} accessibilityLiveRegion="polite">
        <Text style={styles.text}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={refreshing}
          accessibilityState={{ disabled: refreshing, busy: refreshing }}
          onPress={() => void refresh()}
          style={({ pressed }) => [
            styles.retry,
            pressed && styles.pressed,
            refreshing && styles.disabled,
          ]}
        >
          <Text style={styles.retryText}>
            {refreshing ? "Updating…" : "Try again"}
          </Text>
        </Pressable>
      </View>
    );
  if (!shows.length && emptyMessage)
    return (
      <View style={styles.box}>
        <Text style={styles.text}>{emptyMessage}</Text>
      </View>
    );
  return null;
}
const styles = StyleSheet.create({
  box: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  text: { color: colors.muted, fontSize: 13, lineHeight: 19, fontFamily: fonts.regular },
  retry: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.5 },
  retryText: { color: colors.accent, fontFamily: fonts.semibold },
});
