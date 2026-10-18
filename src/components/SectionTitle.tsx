import { fonts } from "@/theme/fonts";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@/theme/colors";
export function SectionTitle({
  title,
  subtitle,
  action,
  onPress,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          accessibilityState={{ disabled: !onPress }}
          accessibilityLabel={`${action}: ${title}`}
          style={({ pressed }) => [styles.action, pressed && styles.pressed, !onPress && styles.disabled]}
          accessibilityRole="button"
        >
          <Text style={styles.link}>{action}</Text>
          <ChevronRight size={16} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fonts.displayBold,
    color: colors.white,
    letterSpacing: -0.5,
  },
  sub: { fontSize: 13, lineHeight: 19, color: colors.muted, marginTop: 4, fontFamily: fonts.medium },
  action: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingHorizontal: 8, borderRadius: 10 },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.45 },
  link: { color: colors.accent, fontSize: 13, fontFamily: fonts.semibold },
});
