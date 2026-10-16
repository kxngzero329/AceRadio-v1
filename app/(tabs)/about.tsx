import { Fragment } from "react";
import { View, Text, Image, StyleSheet, Pressable } from "react-native";
import { PageScrollView } from "@/components/PageScrollView";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Lightbulb,
  RadioTower,
  Infinity as InfinityIcon,
  MapPin,
  ArrowUpRight,
} from "lucide-react-native";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SocialLinks } from "@/components/SocialLinks";
import { openVerifiedLink } from "@/services/links";
import { ABOUT } from "@/data/about";
import { STATION } from "@/config/station";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import { typography } from "@/theme/typography";
import { PageHeading } from "@/components/PageHeading";
import { usePageContentStyle } from "@/hooks/usePageContentStyle";
export default function AboutScreen() {
  const contentStyle = usePageContentStyle();
  const { founders, milestones } = ABOUT;
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <ScreenHeader />
      <PageScrollView
        testID="about-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentStyle}
      >
        <PageHeading
          eyebrow="OUR STORY"
          title={
            <>
              More than a <Text style={{ color: colors.green }}>station.</Text>
            </>
          }
          subtitle={ABOUT.intro}
        />
        <View style={styles.founders}>
          <Text style={styles.h2}>Founded by</Text>
          <View style={styles.people}>
            {founders.map((member, index) => (
              <Fragment key={member.id}>
                {index > 0 && <Text style={styles.and}>&</Text>}
                <View style={styles.person}>
                  <Image
                    source={member.photo}
                    style={styles.face}
                    resizeMode="contain"
                    accessibilityLabel={member.name}
                  />
                  <Text style={styles.personName}>{member.name}</Text>
                  <Text style={styles.role}>{member.role}</Text>
                </View>
              </Fragment>
            ))}
          </View>
        </View>
        <View style={styles.timeline}>
          <Text style={styles.h2}>The journey</Text>
          {milestones.map((event, i) => (
            <View key={event.id} style={styles.milestone}>
              <View style={styles.line}>
                <View
                  style={[
                    styles.point,
                    i === milestones.length - 1 && {
                      backgroundColor: colors.green,
                    },
                  ]}
                />
                {i < milestones.length - 1 ? (
                  <View style={styles.stem} />
                ) : null}
              </View>
              <View style={styles.milestoneText}>
                <Text style={styles.date}>{event.date}</Text>
                <Text style={styles.desc}>{event.description}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.vision}>
          <View style={styles.visionIcon}>
            <Lightbulb size={25} color={colors.green} />
          </View>
          <Text style={styles.visionHeading}>{ABOUT.visionTitle}</Text>
          <Text style={styles.visionText}>{ABOUT.visionBody}</Text>
        </View>
        <View style={styles.highlights}>
          <View style={styles.highlight}>
            <RadioTower size={23} color={colors.green} />
            <Text style={styles.highlightTitle}>Digital first</Text>
            <Text style={styles.highlightSub}>Radio wherever you go</Text>
          </View>
          <View style={styles.highlight}>
            <InfinityIcon size={26} color={colors.green} />
            <Text style={styles.highlightTitle}>No limits</Text>
            <Text style={styles.highlightSub}>Music and connection</Text>
          </View>
        </View>
        <View style={styles.location}>
          <MapPin size={20} color={colors.green} />
          <View style={styles.locationCopy}>
            <Text style={styles.locationTitle}>{STATION.location}</Text>
            <Text style={styles.locationDesc}>{ABOUT.locationDetail}</Text>
          </View>
        </View>
        <Text style={styles.h2}>Stay connected</Text>
        <Text style={styles.connect}>
          Follow us for updates, shows and the latest from AceRadio.
        </Text>
        <SocialLinks />
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.website, pressed && styles.pressed]}
          onPress={() => {
            void openVerifiedLink("website", STATION.website);
          }}
        >
          <Text style={styles.websiteText}>Official website</Text>
          <ArrowUpRight color={colors.green} size={19} />
        </Pressable>
        <Text style={styles.foot}>{ABOUT.footer}</Text>
      </PageScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  founders: { marginTop: 0 },
  h2: {
    ...typography.sectionTitle,
    marginBottom: 16,
  },
  people: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  person: { width: "44%", alignItems: "center", gap: 6 },
  face: { width: 106, height: 106, borderRadius: 54 },
  personName: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 7,
  },
  role: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: "center",
    fontWeight: "600",
  },
  and: { fontSize: 22, color: colors.subtle },
  timeline: { marginTop: 28 },
  milestone: { flexDirection: "row", minHeight: 72 },
  line: { width: 33, alignItems: "center" },
  point: {
    width: 11,
    height: 11,
    backgroundColor: colors.white,
    borderRadius: 6,
    marginTop: 7,
  },
  stem: {
    width: 1,
    backgroundColor: colors.border,
    flex: 1,
    marginVertical: 4,
  },
  milestoneText: { flex: 1, paddingLeft: 10, paddingBottom: 22 },
  date: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.white,
    fontWeight: "600",
  },
  desc: { ...typography.body, marginTop: 4 },
  vision: {
    marginTop: 20,
    padding: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.cardRadius,
    alignItems: "center",
  },
  visionIcon: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    backgroundColor: colors.greenDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  visionHeading: {
    ...typography.sectionTitle,
    textAlign: "center",
    marginTop: 14,
  },
  visionText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted,
    textAlign: "center",
    marginTop: 9,
  },
  highlights: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 12,
  },
  highlight: {
    flexGrow: 1,
    flexBasis: 140,
    padding: 16,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: layout.cardRadius,
    gap: 7,
    minHeight: 126,
  },
  highlightTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  highlightSub: { ...typography.caption },
  location: {
    marginVertical: 28,
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
  },
  locationCopy: { flex: 1 },
  locationTitle: {
    color: colors.white,
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
  },
  locationDesc: { ...typography.caption, marginTop: 4 },
  connect: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    marginTop: -5,
    marginBottom: 18,
  },
  website: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderRadius: layout.controlRadius,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  websiteText: { color: colors.white, fontWeight: "600", fontSize: 14 },
  pressed: { backgroundColor: colors.surface2 },
  foot: {
    marginTop: 28,
    color: colors.subtle,
    fontSize: 11,
    textAlign: "center",
  },
});
