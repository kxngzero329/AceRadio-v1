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
export default function AboutScreen() {
  const { founders, milestones } = ABOUT;
  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <ScreenHeader />
      <PageScrollView
        testID="about-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.eyebrow}>OUR STORY</Text>
        <Text style={styles.title}>
          More than a <Text style={{ color: colors.green }}>station.</Text>
        </Text>
        <Text style={styles.sub}>{ABOUT.intro}</Text>
        <View style={styles.founders}>
          <Text style={styles.h2}>Founded by</Text>
          <View style={styles.people}>
            {founders.map((member, index) => (
              <Fragment key={member.id}>
                {index > 0 && <Text style={styles.and}>&</Text>}
                <View style={styles.person}>
                  <Image source={member.photo} style={styles.face} resizeMode="contain" accessibilityLabel={member.name} />
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
                    i === milestones.length - 1 && { backgroundColor: colors.green },
                  ]}
                />
                {i < milestones.length - 1 ? <View style={styles.stem} /> : null}
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
          <Text style={styles.visionText}>
            {ABOUT.visionBody}
          </Text>
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
          <View>
            <Text style={styles.locationTitle}>{STATION.location}</Text>
            <Text style={styles.locationDesc}>
              {ABOUT.locationDetail}
            </Text>
          </View>
        </View>
        <Text style={styles.h2}>Stay connected</Text>
        <Text style={styles.connect}>
          Follow us for updates, shows and the latest from AceRadio.
        </Text>
        <SocialLinks />
        <Pressable
          style={styles.website}
          onPress={() => { void openVerifiedLink("website", STATION.website); }}
        >
          <Text style={styles.websiteText}>Official website</Text>
          <ArrowUpRight color={colors.green} size={19} />
        </Pressable>
        <Text style={styles.foot}>
          {ABOUT.footer}
        </Text>
      </PageScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 21, paddingBottom: 178 },
  eyebrow: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    marginTop: 14,
  },
  title: {
    fontSize: 35,
    fontWeight: "900",
    color: colors.white,
    letterSpacing: -1.2,
    marginTop: 9,
    lineHeight: 40,
  },
  sub: { color: colors.muted, fontSize: 15, marginTop: 8 },
  founders: { marginTop: 34 },
  h2: {
    fontSize: 21,
    color: colors.white,
    fontWeight: "900",
    letterSpacing: -0.5,
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
    fontWeight: "800",
    textAlign: "center",
    marginTop: 7,
  },
  role: {
    fontSize: 9,
    color: colors.green,
    letterSpacing: 1.2,
    fontWeight: "800",
  },
  and: { fontSize: 22, color: colors.subtle },
  timeline: { marginTop: 34 },
  milestone: { flexDirection: "row", minHeight: 72 },
  line: { width: 33, alignItems: "center" },
  point: {
    width: 11,
    height: 11,
    backgroundColor: colors.white,
    borderRadius: 6,
    marginTop: 7,
  },
  stem: { width: 1, backgroundColor: "#466650", flex: 1, marginVertical: 4 },
  milestoneText: { paddingLeft: 10 },
  date: { fontSize: 17, color: colors.white, fontWeight: "800" },
  desc: { fontSize: 13, color: colors.muted, marginTop: 4 },
  vision: {
    marginTop: 20,
    padding: 24,
    backgroundColor: "#0D2418",
    borderWidth: 1,
    borderColor: "#1D4E32",
    borderRadius: 21,
    alignItems: "center",
  },
  visionIcon: {
    width: 53,
    height: 53,
    borderRadius: 20,
    backgroundColor: "#163C25",
    alignItems: "center",
    justifyContent: "center",
  },
  visionHeading: {
    fontSize: 21,
    color: colors.white,
    fontWeight: "900",
    marginTop: 14,
  },
  visionText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#BCD0C2",
    textAlign: "center",
    marginTop: 9,
  },
  highlights: { flexDirection: "row", gap: 11, marginTop: 15 },
  highlight: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    gap: 7,
    minHeight: 139,
  },
  highlightTitle: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  highlightSub: { fontSize: 11, color: colors.muted, lineHeight: 16 },
  location: {
    marginVertical: 28,
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
  },
  locationTitle: { color: colors.white, fontWeight: "800", fontSize: 13 },
  locationDesc: { color: colors.muted, fontSize: 11, marginTop: 4 },
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
    borderRadius: 14,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  websiteText: { color: colors.white, fontWeight: "800" },
  foot: {
    marginTop: 28,
    color: colors.subtle,
    fontSize: 11,
    textAlign: "center",
  },
});
