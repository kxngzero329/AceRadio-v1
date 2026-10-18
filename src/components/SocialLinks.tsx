import { fonts } from "@/theme/fonts";
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { STATION } from "@/config/station";
import { openVerifiedLink } from "@/services/links";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
const socials = [
  {
    key: "instagram",
    label: "Instagram",
    icon: "instagram",
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: "tiktok",
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "facebook-f",
  },
  { key: "x", label: "X (Twitter)", icon: "x-twitter" },
] as const;
export function SocialLinks({ cardStyle }: { cardStyle?: StyleProp<ViewStyle> } = {}) {
  return (
    <View style={styles.wrap}>
      {socials.map((s) => (
        <Pressable
          key={s.key}
          onPress={() => {
            void openVerifiedLink(s.label, STATION.social[s.key]);
          }}
          accessibilityLabel={`AceRadio on ${s.label}`}
          accessibilityRole="button"
          style={({ pressed }) => [styles.button, cardStyle, pressed && styles.pressed]}
        >
          <FontAwesome6 name={s.icon} size={21} color={colors.white} />
          <Text style={styles.label}>{s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { flexDirection: "row", gap: 9, flexWrap: "wrap" },
  button: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.controlRadius,
    minWidth: 64,
    flexBasis: 64,
    flexGrow: 1,
    minHeight: 76,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    fontFamily: fonts.semibold,
  },
  pressed: { backgroundColor: colors.surface2 },
});
