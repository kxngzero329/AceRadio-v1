import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RadioProvider } from "@/context/RadioContext";
import { FavoritesProvider } from "@/context/FavoritesContext";
import { colors } from "@/theme/colors";
import { FittedImage } from "@/components/FittedImage";
import { blurWebFocus } from "@/utils/navigation";
import { prepareModalHistory } from "@/utils/modalHistory";

prepareModalHistory();

const aceTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.white,
    border: colors.border,
    primary: colors.green,
    notification: colors.green,
  },
};
// The sheet owns its UI-thread slide. Keep the underlying page until it finishes closing.
const sheetOptions = {
  presentation: "transparentModal" as const,
  animation: "none" as const,
  gestureEnabled: false,
  headerBackButtonMenuEnabled: false,
  contentStyle: { backgroundColor: "transparent" },
};

// Keep the native splash visible until the social icon fonts are ready.
SplashScreen.preventAutoHideAsync().catch(console.warn);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FontAwesome6.font);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(console.warn);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.loading}>
        <StatusBar style="light" />
        <FittedImage
          source={require("../assets/splash/splash.png")}
          accessibilityLabel="AceRadio is loading"
        />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <FavoritesProvider>
        <RadioProvider>
          <StatusBar style="light" />
          <ThemeProvider value={aceTheme}>
            <View style={styles.navigation}>
              <Stack
                screenListeners={{ beforeRemove: blurWebFocus }}
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="player" options={sheetOptions} />
                <Stack.Screen name="show/[id]" options={sheetOptions} />
              </Stack>
            </View>
          </ThemeProvider>
        </RadioProvider>
      </FavoritesProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#000000" },
  navigation: { flex: 1, backgroundColor: colors.background },
});
