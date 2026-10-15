import { Pressable, View, StyleSheet } from "react-native";
import { Heart, Menu } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { AceLogo } from "@/components/AceLogo";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
export function ScreenHeader() {
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        style={({ pressed }) => [styles.side, pressed && styles.pressed]}
        onPress={() => router.push("/settings")}
      >
        <Menu color={colors.muted} size={23} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AceRadio home"
        style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
        onPress={() => router.push("/")}
      >
        <AceLogo small />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="My favourites"
        style={({ pressed }) => [styles.side, pressed && styles.pressed]}
        onPress={() => router.push("/favorites")}
      >
        <Heart color={colors.muted} size={23} />
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: {
    height: 72,
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  side: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { minHeight: 52, minWidth: 96, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  pressed: { backgroundColor: colors.surface2, opacity: 0.8 },
});
