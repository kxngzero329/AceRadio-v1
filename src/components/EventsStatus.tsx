import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { layout } from "@/theme/layout";

export function EventsStatus({
  loading,
  error,
  refreshing,
  refresh,
}: {
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
}) {
  if (loading)
    return (
      <View
        testID="events-loading"
        style={styles.box}
        accessible
        accessibilityLabel="Loading events"
        accessibilityState={{ busy: true }}
        aria-busy
      >
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, styles.short]} />
      </View>
    );
  if (!error) return null;
  return (
    <View
      testID="events-error"
      style={styles.box}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.text}>{error}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry loading events"
        disabled={refreshing}
        accessibilityState={{ disabled: refreshing, busy: refreshing }}
        aria-busy={refreshing}
        style={({ pressed }) => [
          styles.retry,
          pressed && styles.pressed,
          refreshing && styles.busy,
        ]}
        onPress={() => void refresh()}
      >
        <Text style={styles.retryText}>
          {refreshing ? "Updating…" : "Try again"}
        </Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  box: {
    padding: 16,
    borderRadius: layout.cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 10,
    marginBottom: 12,
  },
  text: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  retry: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  retryText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 13 },
  pressed: { backgroundColor: colors.surface2 },
  busy: { opacity: 0.5 },
  skeletonTitle: {
    width: "65%",
    height: 20,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  skeletonLine: {
    width: "90%",
    height: 14,
    borderRadius: 4,
    backgroundColor: colors.surface2,
  },
  short: { width: "55%" },
});
