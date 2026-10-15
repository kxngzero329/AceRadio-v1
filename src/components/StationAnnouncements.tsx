import { Pressable, StyleSheet, Text, View } from "react-native";
import { useContent } from "@/context/ContentContext";
import { openVerifiedLink } from "@/services/links";
import { colors } from "@/theme/colors";

export function StationAnnouncements() {
  const { announcements } = useContent();
  if (!announcements.length) return null;
  return <View style={styles.list}>{announcements.map(item => <Pressable key={item.id} style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    disabled={!item.linkUrl} accessibilityRole={item.linkUrl ? "link" : undefined}
    accessibilityState={{ disabled: !item.linkUrl }}
    onPress={() => { if (item.linkUrl) void openVerifiedLink(item.title, item.linkUrl); }}>
    <Text style={styles.title}>{item.title}</Text><Text style={styles.body}>{item.body}</Text>
  </Pressable>)}</View>;
}
const styles = StyleSheet.create({
  list: { gap: 10, marginBottom: 16 },
  card: { padding: 16, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  title: { color: colors.white, fontWeight: "800", fontSize: 15 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 6 },
  pressed: { backgroundColor: colors.surface2 },
});
