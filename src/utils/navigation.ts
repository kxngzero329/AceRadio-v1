import { router as expoRouter } from "expo-router";
import { Platform } from "react-native";

/** Release focus before navigation hides the current browser screen. */
export function blurWebFocus() {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }
}

export const router = {
  canGoBack: () => expoRouter.canGoBack(),
  prefetch: (...args: Parameters<typeof expoRouter.prefetch>) =>
    expoRouter.prefetch(...args),
  replace: (...args: Parameters<typeof expoRouter.replace>) => {
    blurWebFocus();
    expoRouter.replace(...args);
  },
  navigate: (...args: Parameters<typeof expoRouter.navigate>) => {
    blurWebFocus();
    expoRouter.navigate(...args);
  },
  push: (...args: Parameters<typeof expoRouter.push>) => {
    blurWebFocus();
    expoRouter.push(...args);
  },
  back: () => {
    blurWebFocus();
    expoRouter.back();
  },
};
