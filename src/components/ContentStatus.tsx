import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useContent } from "@/context/ContentContext";
import { colors } from "@/theme/colors";

export function ContentStatus({ emptyMessage }: { emptyMessage?: string }) {
  const { loading, error, shows, refresh, refreshing } = useContent();
  if (loading && !shows.length) return <View style={styles.box} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.green} /><Text style={styles.text}>Loading station content…</Text></View>;
  if (error) return <View style={styles.box} accessibilityLiveRegion="polite"><Text style={styles.text}>{error}</Text><Pressable accessibilityRole="button" disabled={refreshing} onPress={() => void refresh()} style={styles.retry}><Text style={styles.retryText}>{refreshing ? "Updating…" : "Try again"}</Text></Pressable></View>;
  if (!shows.length && emptyMessage) return <View style={styles.box}><Text style={styles.text}>{emptyMessage}</Text></View>;
  return null;
}
const styles = StyleSheet.create({
  box: { padding: 16, marginVertical: 12, borderRadius: 12, backgroundColor: colors.surface, gap: 10 },
  text: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  retry: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: 10 },
  retryText: { color: colors.green, fontWeight: "700" },
});
