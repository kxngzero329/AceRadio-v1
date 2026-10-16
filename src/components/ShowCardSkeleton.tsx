import { StyleSheet, View } from "react-native";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";

/** Static placeholders avoid continuous animation while the catalogue loads. */
export function ShowCardSkeleton({ width }: { width: number }) {
  return (
    <View style={[styles.card, { width }]}>
      <View style={styles.image} />
      <View style={styles.body}>
        <View style={styles.title} />
        <View style={styles.line} />
        <View style={[styles.line, styles.short]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: layout.cardRadius,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  image: { width: "100%", aspectRatio: 1, backgroundColor: colors.surface2 },
  body: { padding: 12, gap: 12, minHeight: 148 },
  title: {
    height: 16,
    width: "85%",
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  line: {
    height: 12,
    width: "75%",
    borderRadius: 4,
    backgroundColor: colors.surface2,
  },
  short: { width: "60%" },
});
