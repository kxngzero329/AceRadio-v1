import { fonts } from "./fonts";
import { StyleSheet } from "react-native";
import { colors } from "./colors";

export const typography = StyleSheet.create({
  eyebrow: {
    color: colors.accent,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: fonts.semibold,
    letterSpacing: 1.5,
  },
  pageTitle: {
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontFamily: fonts.displayBold,
    letterSpacing: -0.6,
  },
  sectionTitle: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: fonts.displayBold,
    letterSpacing: -0.2,
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22, fontFamily: fonts.regular },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18, fontFamily: fonts.medium },
});
