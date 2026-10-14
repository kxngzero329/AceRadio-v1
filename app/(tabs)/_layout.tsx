import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Home, Radio, Heart, Info, Settings2 } from "lucide-react-native";
import { Easing, Platform, View } from "react-native";
import { MiniPlayer } from "@/components/MiniPlayer";
import { colors } from "@/theme/colors";
import { blurWebFocus, router } from "@/utils/navigation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
export default function TabLayout() {
  const reducedMotion = useReducedMotion();
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
          tabBarInactiveTintColor: colors.subtle,
          tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: 1 },
          tabBarStyle: {
            backgroundColor: "#090E0B",
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 78,
            paddingTop: 9,
            paddingBottom: 14,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="shows"
          options={{
            title: "Shows",
            tabBarIcon: ({ color, size }) => (
              <Radio size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="favorites"
          options={{
            title: "Saved",
            tabBarIcon: ({ color, size }) => (
              <Heart size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="about"
          options={{
            title: "About",
            tabBarIcon: ({ color, size }) => <Info size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => (
              <Settings2 size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}
