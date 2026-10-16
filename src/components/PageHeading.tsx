import type { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { typography } from "@/theme/typography";

export function PageHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: string;
}) {
  return (
    <View style={styles.heading}>
      <Text style={typography.eyebrow}>{eyebrow}</Text>
      <Text
        accessibilityRole="header"
        style={[typography.pageTitle, styles.title]}
      >
        {title}
      </Text>
      <Text style={[typography.body, styles.subtitle]}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: 24 },
  title: { marginTop: 6 },
  subtitle: { marginTop: 6 },
});
