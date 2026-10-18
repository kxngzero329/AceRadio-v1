import { fonts } from "./fonts";

/** Local assets work offline, on native, web and in Expo Go. */
export const fontAssets = {
  [fonts.displayBold]: require("../../assets/fonts/Outfit_700Bold.ttf"),
  [fonts.displayExtraBold]: require("../../assets/fonts/Outfit_800ExtraBold.ttf"),
  [fonts.regular]: require("../../assets/fonts/Manrope_400Regular.ttf"),
  [fonts.medium]: require("../../assets/fonts/Manrope_500Medium.ttf"),
  [fonts.semibold]: require("../../assets/fonts/Manrope_600SemiBold.ttf"),
};
