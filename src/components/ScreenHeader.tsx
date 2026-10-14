import { Pressable, View, StyleSheet } from "react-native";
import { Heart, Menu } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { AceLogo } from "@/components/AceLogo";
import { colors } from "@/theme/colors";
export function ScreenHeader() {
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        style={styles.side}
        onPress={() => router.push("/settings")}
      >
        <Menu color={colors.white} size={26} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AceRadio home"
        onPress={() => router.push("/")}
      >
        <AceLogo small />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="My favourites"
        style={[styles.side, styles.right]}
        onPress={() => router.push("/favorites")}
      >
        <Heart color={colors.white} size={26} />
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: {
    height: 83,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 23,
  },
  side: {
    width: 46,
    height: 46,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  right: { alignItems: "flex-end" },
});
