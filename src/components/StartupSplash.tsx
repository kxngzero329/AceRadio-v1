import { Animated, Image, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import type { useStartupTransition } from "@/hooks/useStartupTransition";
import { colors } from "@/theme/colors";

type Props = Pick<ReturnType<typeof useStartupTransition>,
  "opacity" | "bars" | "onOverlayLayout" | "onLogoReady">;

export function StartupSplash({ opacity, bars, onOverlayLayout, onLogoReady }: Props) {
  const { width } = useWindowDimensions();
  // Match app.json's native splash canvas so the supplied mark does not jump.
  const logoSize = Math.min(width, Platform.OS === "android" ? 224 : 320);
  return (
    <Animated.View
      testID="startup-splash"
      style={[styles.overlay, { opacity }]}
      onLayout={onOverlayLayout}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="AceRadio is loading"
      accessibilityState={{ busy: true }}
    >
      <Image
        testID="startup-logo"
        source={require("../../assets/splash/splash-icon.png")}
        style={{ width: logoSize, height: logoSize }}
        resizeMode="contain"
        accessible={false}
        fadeDuration={0}
        onLoad={onLogoReady}
        onError={onLogoReady}
      />
      <View
        testID="startup-equalizer"
        style={[styles.equalizer, { marginTop: logoSize * 0.27 + 12 }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {bars.map((scaleY, index) => (
          <Animated.View
            key={index}
            style={[styles.bar, { transform: [{ scaleY }] }]}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  equalizer: {
    position: "absolute",
    top: "50%",
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  bar: { width: 3, height: 22, borderRadius: 2, backgroundColor: colors.muted },
});
