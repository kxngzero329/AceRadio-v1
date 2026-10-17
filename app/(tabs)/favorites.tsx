import { View, Text, StyleSheet, Pressable } from "react-native";
import { Heart, ArrowRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "@/utils/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ShowGrid } from "@/components/ShowGrid";
import { PageScrollView } from "@/components/PageScrollView";
import { useFavorites } from "@/context/FavoritesContext";
import { useContent } from "@/context/ContentContext";
import { ContentStatus } from "@/components/ContentStatus";
import { AccountSyncStatus } from "@/components/AccountSyncStatus";
import { useAccountData } from "@/context/AccountDataContext";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import { typography } from "@/theme/typography";
import { PageHeading } from "@/components/PageHeading";
import { usePageContentStyle } from "@/hooks/usePageContentStyle";
export default function FavoritesScreen() {
  const contentStyle = usePageContentStyle();
  const { shows, loading, error } = useContent();
  const { favorites, ready } = useFavorites();
  const { signedIn, canEdit, error: accountError } = useAccountData();
  const selected = shows.filter((s) => favorites.includes(s.id));
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <ScreenHeader />
      <PageScrollView
        testID="favorites-scroll"
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
      >
        <PageHeading
          eyebrow="YOUR COLLECTION"
          title={
            <>
              Saved <Text style={{ color: colors.green }}>shows.</Text>
            </>
          }
          subtitle="The voices you keep coming back to."
        />
        <ContentStatus showLoading={false} />
        <AccountSyncStatus showGuest />
        {!ready || (loading && !shows.length) ? (
          <ShowGrid shows={[]} loading />
        ) : selected.length ? (
          <View style={styles.grid}>
            <ShowGrid shows={selected} />
          </View>
        ) : (signedIn && !canEdit && accountError) ||
          (error && !shows.length) ? null : favorites.length > 0 ? (
          <Text style={styles.emptyDesc}>
            Your saved shows are currently unavailable. Your favourites are
            still saved{signedIn ? " to your account." : " on this device."}
          </Text>
        ) : (
          <View testID="favorites-empty" style={styles.empty}>
            <View style={styles.heart}>
              <Heart size={40} color={colors.green} />
            </View>
            <Text style={styles.emptyTitle}>Make it yours.</Text>
            <Text style={styles.emptyDesc}>
              Tap the heart on a show to save it here.{" "}
              {signedIn
                ? "Your favourites sync across your devices."
                : "Your favourites stay on this device until you add them to an account."}
            </Text>
            <Pressable
              testID="favorites-discover"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push("/shows")}
            >
              <Text style={styles.buttonText}>Discover shows</Text>
              <ArrowRight color={colors.background} size={18} />
            </Pressable>
          </View>
        )}
      </PageScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  grid: { marginTop: 0 },
  empty: {
    paddingHorizontal: 20,
    paddingVertical: 32,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.cardRadius,
  },
  heart: {
    width: 64,
    height: 64,
    borderRadius: layout.cardRadius,
    backgroundColor: colors.greenDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    ...typography.sectionTitle,
    marginTop: 20,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 23,
    maxWidth: 275,
    marginTop: 12,
  },
  button: {
    marginTop: 24,
    minHeight: 48,
    backgroundColor: colors.green,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 19,
    borderRadius: layout.controlRadius,
  },
  buttonText: { fontWeight: "700", fontSize: 14, color: colors.background },
  pressed: { opacity: 0.8 },
});
