import type { ReactNode } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenSafeArea } from "@/components/ScreenSafeArea";
import { ChevronLeft } from "lucide-react-native";
import { useModalTransition } from "@/hooks/useModalTransition";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { layout } from "@/theme/layout";

/** Reuse the player/detail dismissal guard and native transition for content pages. */
export function ContentSheet({
  title,
  testID,
  children,
}: {
  title: string;
  testID: string;
  children: ReactNode;
}) {
  const { close, isClosing, isTransitioning, style } = useModalTransition();
  return (
    <Animated.View
      testID={testID}
      style={[styles.root, style]}
      pointerEvents={isClosing ? "none" : "auto"}
      renderToHardwareTextureAndroid={isTransitioning}
      shouldRasterizeIOS={isTransitioning}
      collapsable={false}
    >
      <ScreenSafeArea style={styles.root}>
        <View style={styles.header}>
          <Pressable
            onPress={close}
            disabled={isClosing}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityState={{ disabled: isClosing }}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <ChevronLeft size={23} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.spacer} />
        </View>
        <ScrollView
          testID={`${testID}-scroll`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      </ScreenSafeArea>
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    minHeight: 60,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: { width: 44 },
  title: {
    color: colors.muted,
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 20,
    flexShrink: 1,
    textAlign: "center",
  },
  content: {
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  pressed: { backgroundColor: colors.surface2 },
});
