import { useWindowDimensions, type ViewStyle } from "react-native";
import { useRadio } from "@/context/RadioContext";
import { layout, miniPlayerClearance } from "@/theme/layout";

/** Keep the final page action reachable above the floating player. */
export function usePageContentStyle(): ViewStyle {
  const { width, fontScale } = useWindowDimensions();
  const { hasPlayed, currentShow } = useRadio();
  return {
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    paddingHorizontal: width < 360 ? 16 : layout.gutter,
    paddingTop: 8,
    paddingBottom:
      hasPlayed && currentShow ? miniPlayerClearance(width, fontScale) : 28,
  };
}
