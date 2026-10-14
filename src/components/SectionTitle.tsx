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
          style={styles.action}
          accessibilityRole="button"
        >
          <Text style={styles.link}>{action}</Text>
          <ChevronRight size={16} color={colors.green} />
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
    paddingBottom: 15,
  },
  title: {
    fontSize: 23,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.7,
  },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4 },
  action: { flexDirection: "row", alignItems: "center", gap: 2 },
  link: { color: colors.green, fontSize: 13, fontWeight: "700" },
});
