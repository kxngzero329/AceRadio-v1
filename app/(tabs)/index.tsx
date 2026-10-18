import { fonts } from "@/theme/fonts";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { PageScrollView } from "@/components/PageScrollView";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowUpRight, Headphones } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionTitle } from "@/components/SectionTitle";
import { ShowCarousel } from "@/components/ShowCarousel";
import { ShowSpotlight } from "@/components/ShowSpotlight";
import { LiveRadioHero } from "@/components/LiveRadioHero";
import { LiveNoticeBoard } from "@/components/LiveNoticeBoard";
import { useContent } from "@/context/ContentContext";
import { usePageContentStyle } from "@/hooks/usePageContentStyle";
import { ContentStatus } from "@/components/ContentStatus";
import { StationAnnouncements } from "@/components/StationAnnouncements";
import { HomeBanners } from "@/components/HomeBanners";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";

export default function HomeScreen() {
  const { shows, banners, loading } = useContent();
  const contentStyle = usePageContentStyle();
  const hasSpotlight = banners.some(
    (banner) => banner.placement === "home_spotlight",
  );
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader />
      <PageScrollView
        testID="home-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[contentStyle, styles.scroll]}
      >
        <LiveRadioHero />
        <ContentStatus
          showLoading={false}
          emptyMessage="The show lineup will appear here when it is published."
        />
        <StationAnnouncements />
        <HomeBanners />
        <LiveNoticeBoard />
        <View style={styles.stationNote}>
          <Headphones color={colors.muted} size={14} />
          <Text style={styles.noteText}>Free to listen</Text>
          <View style={styles.noteDot} />
          <Text style={styles.noteText}>From Cape Town</Text>
        </View>
        {hasSpotlight && (
          <>
            <SectionTitle title="Show spotlight" />
            <ShowSpotlight />
          </>
        )}
        {(shows.length > 0 || loading) && (
          <>
            <SectionTitle
              title="Our shows"
              action="See all"
              onPress={() => router.push("/shows")}
            />
            <View style={styles.grid}>
              <ShowCarousel shows={shows} loading={loading && !shows.length} />
            </View>
          </>
        )}
        <View style={styles.footer}>
          <View style={styles.footerCopy}>
            <Text style={styles.footerTitle}>Made in Cape Town.</Text>
            <Text style={styles.footerSub}>
              Built for those who listen differently.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read the AceRadio story"
            onPress={() => router.push("/about")}
            style={({ pressed }) => [styles.learn, pressed && styles.pressed]}
          >
            <Text style={styles.learnText}>Our story</Text>
            <ArrowUpRight size={16} color={colors.accent} />
          </Pressable>
        </View>
      </PageScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingTop: 4 },
  stationNote: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    marginBottom: layout.sectionGap,
  },
  noteText: { color: colors.muted, fontSize: 12, lineHeight: 18, fontFamily: fonts.medium },
  noteDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.subtle,
    marginHorizontal: 2,
  },
  grid: { marginBottom: layout.sectionGap },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  footerCopy: { flexGrow: 1, flexShrink: 1 },
  footerTitle: {
    color: colors.white,
    fontSize: 13,
    fontFamily: fonts.semibold,
    lineHeight: 20,
  },
  footerSub: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2, fontFamily: fonts.regular,
  },
  learn: {
    minHeight: 44,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    paddingHorizontal: 8,
    borderRadius: layout.controlRadius,
  },
  learnText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 12 },
  pressed: { backgroundColor: colors.surface2 },
});
