import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

export function useReducedMotion(initiallyReduced = false) {
  const [reduced, setReduced] = useState(() =>
    Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : initiallyReduced,
  );
  useEffect(() => {
    let mounted = true;
    const update = (value: boolean) => {
      if (mounted) setReduced(value);
    };
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(update)
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      update,
    );
    return () => {
      mounted = false;
      listener?.remove();
    };
  }, []);
  return reduced;
}
