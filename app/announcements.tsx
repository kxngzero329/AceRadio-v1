import { StyleSheet, Text, View } from "react-native";
import { Megaphone } from "lucide-react-native";
import { ContentSheet } from "@/components/ContentSheet";
import { ContentStatus } from "@/components/ContentStatus";
import { ExternalContentButton } from "@/components/ExternalContentButton";
import { useContent } from "@/context/ContentContext";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import { typography } from "@/theme/typography";

export default function AnnouncementsScreen() {
  const { announcements, loading, error } = useContent();
  return (
    <ContentSheet title="Station updates" testID="announcements-sheet">
      <Text accessibilityRole="header" style={typography.pageTitle}>
        Station updates
      </Text>
      <Text style={styles.intro}>The latest from AceRadio.</Text>
      <ContentStatus />
      <View style={styles.list}>
        {announcements.map((item) => (
          <View
            key={item.id}
            testID={`announcement-${item.id}`}
            style={styles.card}
          >
            <Text accessibilityRole="header" style={typography.sectionTitle}>
              {item.title}
            </Text>
            <Text selectable style={styles.body}>
              {item.body}
            </Text>
            {item.linkUrl && (
              <ExternalContentButton
                label="More information"
                url={item.linkUrl}
              />
            )}
          </View>
        ))}
      </View>
      {!loading && !error && !announcements.length && (
        <View testID="announcements-empty" style={styles.empty}>
          <Megaphone size={32} color={colors.subtle} />
          <Text style={typography.sectionTitle}>You’re up to date</Text>
          <Text style={styles.emptyText}>
            New station announcements will appear here.
          </Text>
        </View>
      )}
    </ContentSheet>
  );
}
const styles = StyleSheet.create({
  intro: { ...typography.body, marginTop: 8, marginBottom: 24 },
  list: { gap: 16 },
  card: {
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.cardRadius,
  },
  body: { ...typography.body, marginTop: 10 },
  empty: { alignItems: "center", gap: 14, paddingVertical: 32 },
  emptyText: { ...typography.body, textAlign: "center" },
});
