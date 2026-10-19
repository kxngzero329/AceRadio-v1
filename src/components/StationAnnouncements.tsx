import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Megaphone } from "lucide-react-native";
import { useContent } from "@/context/ContentContext";
import { router } from "@/utils/navigation";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { layout } from "@/theme/layout";

export function StationAnnouncements() {
  const { announcements } = useContent();
  const item = announcements[0];
  if (!item) return null;
  return (
    <Pressable
      testID="station-announcement"
      accessibilityRole="button"
      accessibilityLabel={`Station update: ${item.title}. Read ${announcements.length > 1 ? "all updates" : "more"}`}
      onPress={() => router.push("/announcements")}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Megaphone size={14} color={colors.muted} />
        <Text style={styles.overline}>
          STATION UPDATE
          {announcements.length > 1 ? ` · ${announcements.length}` : ""}
        </Text>
      </View>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.action}>
          <Text style={styles.actionText}>Tap to view</Text>
          <ChevronRight size={14} color={colors.muted} />
        </View>
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 16,
    borderRadius: layout.cardRadius,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    minHeight: 44,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 7,
  },
  overline: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: fonts.semibold,
    letterSpacing: 0.8,
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.white,
    fontFamily: fonts.displayBold,
    fontSize: 16,
    lineHeight: 22,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  actionText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.medium,
  },
  pressed: { backgroundColor: colors.surface2, opacity: 0.85 },
});
