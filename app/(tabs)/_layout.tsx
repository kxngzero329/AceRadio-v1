import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Home, Radio, Heart, Info, Settings2, type LucideIcon } from "lucide-react-native";
import { Easing, Platform, StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MiniPlayer } from "@/components/MiniPlayer";
import { colors } from "@/theme/colors";
import { blurWebFocus, router } from "@/utils/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { tabBarHeight } from "@/theme/layout";

function TabIcon({ icon: Icon, color, focused }: { icon: LucideIcon; color: ColorValue; focused: boolean }) {
  return <View style={[styles.icon, focused && styles.iconActive]}><Icon size={22} color={color} strokeWidth={focused ? 2.3 : 1.8} /></View>;
}
export default function TabLayout() {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const warmPlayer = setTimeout(() => router.prefetch("/player"), 700);
    return () => clearTimeout(warmPlayer);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        detachInactiveScreens={Platform.OS === "web"}
        screenListeners={{ tabPress: blurWebFocus }}
        screenOptions={{
          headerShown: false,
          lazy: Platform.OS === "web",
          sceneStyle: { backgroundColor: colors.background },
          animation: reducedMotion ? "none" : "fade",
          transitionSpec: {
            animation: "timing",
            config: {
              duration: reducedMotion ? 0 : 200,
              easing: Easing.out(Easing.cubic),
            },
          },
          tabBarActiveTintColor: colors.green,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", lineHeight: 14, marginTop: 3 },
          tabBarItemStyle: { paddingHorizontal: 2 },
          tabBarIconStyle: { width: 44, height: 30 },
          tabBarAllowFontScaling: true,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: tabBarHeight(insets.bottom),
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, focused }) => <TabIcon icon={Home} color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="shows"
          options={{
            title: "Shows",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon icon={Radio} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="favorites"
          options={{
            title: "Saved",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon icon={Heart} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="about"
          options={{
            title: "About",
            tabBarIcon: ({ color, focused }) => <TabIcon icon={Info} color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon icon={Settings2} color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 44, height: 30, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  iconActive: { backgroundColor: colors.greenDeep },
});
