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
import { colors } from "@/theme/colors";
export default function FavoritesScreen() {
  const { shows, loading, error } = useContent();
  const { favorites, ready } = useFavorites();
  const selected = shows.filter((s) => favorites.includes(s.id));
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <ScreenHeader />
      <PageScrollView
        testID="favorites-scroll"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>YOUR COLLECTION</Text>
        <Text style={styles.title}>
          Saved <Text style={{ color: colors.green }}>shows.</Text>
        </Text>
        <Text style={styles.sub}>The voices you keep coming back to.</Text>
        <ContentStatus />
        {!ready || (loading && !shows.length) ? (
          <Text style={styles.emptyDesc}>Loading your saved shows…</Text>
        ) : selected.length ? (
          <View style={styles.grid}>
            <ShowGrid shows={selected} />
          </View>
        ) : error && !shows.length ? null : favorites.length > 0 ? (
          <Text style={styles.emptyDesc}>Your saved shows are currently unavailable. Your favourites are still saved on this device.</Text>
        ) : (
          <View testID="favorites-empty" style={styles.empty}>
            <View style={styles.heart}>
              <Heart size={40} color={colors.green} />
            </View>
            <Text style={styles.emptyTitle}>Make it yours.</Text>
            <Text style={styles.emptyDesc}>
              Tap the heart on a show to save it here. Your favourites stay on
              this device.
            </Text>
            <Pressable
              testID="favorites-discover"
              accessibilityRole="button"
              style={styles.button}
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
  content: { paddingHorizontal: 20, paddingBottom: 178 },
  eyebrow: {
    fontSize: 10,
    color: colors.green,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 14,
  },
  title: {
    fontSize: 37,
    color: colors.white,
    fontWeight: "900",
    marginTop: 8,
    letterSpacing: -1.4,
  },
  sub: { fontSize: 14, color: colors.muted, marginTop: 5 },
  grid: { marginTop: 28 },
  empty: { paddingTop: 90, alignItems: "center" },
  heart: {
    width: 95,
    height: 95,
    borderRadius: 30,
    backgroundColor: "#0F2C1C",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.white,
    fontSize: 25,
    fontWeight: "900",
    marginTop: 26,
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
    marginTop: 28,
    backgroundColor: colors.green,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 19,
    borderRadius: 13,
  },
  buttonText: { fontWeight: "900", color: colors.background },
});
