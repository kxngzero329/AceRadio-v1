import { View, Text, Pressable, StyleSheet } from "react-native";
import { PageScrollView } from "@/components/PageScrollView";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowUpRight, Headphones, Signal } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionTitle } from "@/components/SectionTitle";
import { ShowCarousel } from "@/components/ShowCarousel";
import { ShowSpotlight } from "@/components/ShowSpotlight";
import { LiveRadioHero } from "@/components/LiveRadioHero";
import { LiveNoticeBoard } from "@/components/LiveNoticeBoard";
import { useContent } from "@/context/ContentContext";
import { ContentStatus } from "@/components/ContentStatus";
import { StationAnnouncements } from "@/components/StationAnnouncements";
import { HomeBanners } from "@/components/HomeBanners";
import { colors } from "@/theme/colors";
import { STATION } from "@/config/station";

export default function HomeScreen() {
  const { shows } = useContent();
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScreenHeader />
      <PageScrollView
        testID="home-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* <View style={styles.greeting}>
          <Text style={styles.eyebrow}>{STATION.location.toUpperCase()}</Text>
          <Text style={styles.heading}>
            Hear the <Text style={{ color: colors.green }}>difference.</Text>
          </Text>
          <Text style={styles.subtitle}>
            Your soundtrack starts right here.
          </Text>
        </View> */}

        <LiveRadioHero />
        <ContentStatus emptyMessage="The show lineup will appear here when it is published." />
        <StationAnnouncements />
        <HomeBanners />
        <LiveNoticeBoard />

        <View style={styles.stats}>
          <View style={styles.statItem}>
            <Headphones color={colors.green} size={20} />
            <View>
              <Text style={styles.statTitle}>Free listening</Text>
              <Text style={styles.statSub}>Just press play</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Signal color={colors.green} size={20} />
            <View>
              <Text style={styles.statTitle}>From Cape Town</Text>
              <Text style={styles.statSub}>Streaming online</Text>
            </View>
          </View>
        </View>

        <SectionTitle
          title="Show spotlight"
          subtitle="Meet your next favourite show"
        />
        <ShowSpotlight />

        <SectionTitle
          title="Our shows"
          subtitle="Find your next favourite"
          action="See all"
          onPress={() => router.push("/shows")}
        />
        <View style={styles.grid}>
          <ShowCarousel shows={shows} />
        </View>

        <View style={styles.manifesto}>
          <Text style={styles.manifestoLabel}>THE ACE RADIO WAY</Text>
          <Text style={styles.manifestoText}>
            Not just background noise.{"\n"}
            <Text style={{ color: colors.green }}>A feeling.</Text>
          </Text>
          <Text style={styles.manifestoSub}>
            Made in Cape Town. Created for people who listen differently.
          </Text>
          <Pressable onPress={() => router.push("/about")} style={styles.learn}>
            <Text style={styles.learnText}>Our story</Text>
            <ArrowUpRight size={17} color={colors.green} />
          </Pressable>
        </View>
      </PageScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 21, paddingBottom: 177 },
  greeting: { marginTop: 4, marginBottom: 24 },
  eyebrow: {
    color: colors.green,
    fontWeight: "800",
    letterSpacing: 2.1,
    fontSize: 10,
  },
  heading: {
    fontSize: 37,
    fontWeight: "900",
    letterSpacing: -1.9,
    color: colors.white,
    marginTop: 8,
  },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 5 },
  stats: {
    backgroundColor: colors.surface,
    borderRadius: 17,
    flexDirection: "row",
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center" },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  statTitle: { fontSize: 12, color: colors.white, fontWeight: "800" },
  statSub: { fontSize: 10, color: colors.muted, marginTop: 4 },
  grid: { marginBottom: 28 },
  manifesto: {
    marginTop: 6,
    backgroundColor: "#0E1913",
    borderRadius: 21,
    borderColor: "#234832",
    borderWidth: 1,
    padding: 22,
  },
  manifestoLabel: {
    fontSize: 10,
    color: colors.green,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  manifestoText: {
    fontSize: 26,
    lineHeight: 33,
    fontWeight: "900",
    letterSpacing: -0.9,
    color: colors.white,
    marginTop: 12,
  },
  manifestoSub: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginTop: 11,
  },
  learn: { flexDirection: "row", gap: 7, alignItems: "center", marginTop: 21 },
  learnText: { color: colors.green, fontWeight: "800", fontSize: 13 },
});
