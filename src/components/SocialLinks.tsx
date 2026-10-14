import { View, Text, Pressable, StyleSheet } from "react-native";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { STATION } from "@/config/station";
import { openVerifiedLink } from "@/services/links";
import { colors } from "@/theme/colors";
const socials = [
  {
    key: "instagram",
    label: "Instagram",
    icon: "instagram",
    url: STATION.social.instagram,
  },
  {
    key: "tiktok",
    label: "TikTok",
    icon: "tiktok",
    url: STATION.social.tiktok,
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "facebook-f",
    url: STATION.social.facebook,
  },
  { key: "x", label: "X (Twitter)", icon: "x-twitter", url: STATION.social.x },
] as const;
export function SocialLinks() {
  return (
    <View style={styles.wrap}>
      {socials.map((s) => (
        <Pressable
          key={s.key}
          onPress={() => void openVerifiedLink(s.label, s.url)}
          accessibilityLabel={`AceRadio on ${s.label}`}
          accessibilityRole="button"
          style={styles.button}
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
    borderRadius: 12,
    width: 74,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  label: { color: colors.muted, fontSize: 10, fontWeight: "600" },
});