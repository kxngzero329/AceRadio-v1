import { useCallback, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import Constants, { ExecutionEnvironment } from "expo-constants";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { RadioProvider } from "@/context/RadioContext";
import { ContentProvider } from "@/context/ContentContext";
import { AuthProvider } from "@/context/AuthContext";
import { AccountDataProvider } from "@/context/AccountDataContext";
import { colors } from "@/theme/colors";
import { applyWebTheme } from "@/theme/applyWebTheme";
import { StartupSplash } from "@/components/StartupSplash";
import { useStartupTransition } from "@/hooks/useStartupTransition";
import { blurWebFocus } from "@/utils/navigation";
import { prepareModalHistory } from "@/utils/modalHistory";
import { fonts } from "@/theme/fonts";
import { fontAssets } from "@/theme/fontAssets";
import { PushNotificationProvider } from "@/context/PushNotificationContext";
import { NotificationNotice } from "@/components/NotificationNotice";

prepareModalHistory();
applyWebTheme();

const aceTheme = {
  ...DarkTheme,
  fonts: {
    regular: { fontFamily: fonts.regular, fontWeight: "normal" as const },
    medium: { fontFamily: fonts.semibold, fontWeight: "normal" as const },
    bold: { fontFamily: fonts.displayBold, fontWeight: "normal" as const },
    heavy: { fontFamily: fonts.displayExtraBold, fontWeight: "normal" as const },
  },
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.white,
    border: colors.border,
    primary: colors.accent,
    notification: colors.accent,
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

// Hand the native screen to our matching overlay before revealing the interface.
SplashScreen.preventAutoHideAsync().catch(console.warn);
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient)
  SplashScreen.setOptions({ duration: 0, fade: false });

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ ...FontAwesome6.font, ...fontAssets });
  const [appReady, setAppReady] = useState(false);
  const startup = useStartupTransition(appReady);
  const onReadyLayout = useCallback(() => setAppReady(true), []);
  const setNavigationRef = useCallback((view: View | null) => {
    // Also block keyboard focus on web while the overlay covers the app.
    if (Platform.OS === "web" && view) {
      (view as unknown as HTMLElement).inert = startup.visible;
    }
  }, [startup.visible]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View
        ref={setNavigationRef}
        style={styles.navigation}
        pointerEvents={startup.visible ? "none" : "auto"}
        accessibilityElementsHidden={startup.visible}
        importantForAccessibility={startup.visible ? "no-hide-descendants" : "auto"}
        aria-hidden={startup.visible}
      >
        {(fontsLoaded || fontError) && (
          <SafeAreaProvider>
            <ContentProvider>
              <AuthProvider>
                <AccountDataProvider>
                  <RadioProvider>
                    <PushNotificationProvider startupReady={appReady && !startup.visible}>
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
                          <Stack.Screen name="events" options={sheetOptions} />
                          <Stack.Screen name="event/[id]" options={sheetOptions} />
                          <Stack.Screen name="announcements" options={sheetOptions} />
                          <Stack.Screen name="account" />
                        </Stack>
                        <NotificationNotice />
                      </View>
                    </ThemeProvider>
                    </PushNotificationProvider>
                  </RadioProvider>
                </AccountDataProvider>
              </AuthProvider>
            </ContentProvider>
          </SafeAreaProvider>
        )}
      </View>
      {startup.visible && <StartupSplash {...startup} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  navigation: { flex: 1, backgroundColor: colors.background },
});
