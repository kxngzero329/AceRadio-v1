import { StyleSheet } from "react-native";
import { colors } from "./colors";

export const typography = StyleSheet.create({
  eyebrow: {
    color: colors.green,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  pageTitle: {
    color: colors.white,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: -1,
  },
  sectionTitle: {
    color: colors.white,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  caption: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
