import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RadioProvider } from "@/context/RadioContext";
import { ContentProvider } from "@/context/ContentContext";
import { AuthProvider } from "@/context/AuthContext";
import { AccountDataProvider } from "@/context/AccountDataContext";
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
SplashScreen.setOptions({ duration: 200, fade: true });

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FontAwesome6.font);

  // Wait for the ready navigation view to lay out before revealing it.
  // Network requests and account restoration never hold the native splash open.
  const onReadyLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(console.warn);
  }, []);

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
      <ContentProvider>
        <AuthProvider>
          <AccountDataProvider>
            <RadioProvider>
              <StatusBar style="light" />
              <ThemeProvider value={aceTheme}>
                <View style={styles.navigation} onLayout={onReadyLayout}>
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
                    <Stack.Screen name="account" />
                  </Stack>
                </View>
              </ThemeProvider>
            </RadioProvider>
          </AccountDataProvider>
        </AuthProvider>
      </ContentProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: "#000000" },
  navigation: { flex: 1, backgroundColor: colors.background },
});
