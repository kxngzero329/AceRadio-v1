import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Platform } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motion } from "@/theme/motion";

const restingBars = [0.35, 0.65, 0.95, 0.65, 0.35];

/** Hand the native launch screen to a painted overlay, then reveal the laid-out app. */
export function useStartupTransition(appReady: boolean) {
  // Be conservative until the native accessibility preference has been read.
  const reducedMotion = useReducedMotion(true);
  const [visible, setVisible] = useState(true);
  const [laidOut, setLaidOut] = useState(false);
  const [logoReady, setLogoReady] = useState(false);
  const [nativeReleased, setNativeReleased] = useState(false);
  const [active, setActive] = useState(() =>
    AppState.currentState == null || AppState.currentState === "active",
  );
  const released = useRef(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const bars = useRef(restingBars.map(value => new Animated.Value(value))).current;
  const onOverlayLayout = useCallback(() => setLaidOut(true), []);
  // Both image success and failure release startup; a broken asset must not trap users.
  const onLogoReady = useCallback(() => setLogoReady(true), []);

  useEffect(() => {
    const listener = AppState.addEventListener("change", state => setActive(state === "active"));
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (!laidOut || !logoReady || released.current) return;
    released.current = true;
    try {
      // No second native fade: the overlay owns the cross-platform transition.
      SplashScreen.hide();
    } catch (error) {
      console.warn("Unable to hide the native launch screen", error);
    }
    setNativeReleased(true);
  }, [laidOut, logoReady]);

  useEffect(() => {
    if (reducedMotion) bars.forEach((bar, index) => bar.setValue(restingBars[index]));
    if (!visible || !nativeReleased || appReady || !active || reducedMotion) return;
    const loops = bars.map((bar, index) => Animated.loop(Animated.sequence([
      Animated.timing(bar, {
        toValue: 1,
        duration: 340 + index * 65,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      }),
      Animated.timing(bar, {
        toValue: 0.25,
        duration: 440 + index * 45,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      }),
    ]), { resetBeforeIteration: false }));
    loops.forEach(loop => loop.start());
    return () => loops.forEach(loop => loop.stop());
  }, [active, appReady, bars, nativeReleased, reducedMotion, visible]);

  useEffect(() => {
    if (!visible || !appReady || !nativeReleased) return;
    if (reducedMotion || !active) {
      opacity.setValue(0);
      setVisible(false);
      return;
    }
    let current = true;
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: motion.startupOut,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (current && finished) setVisible(false);
    });
    return () => {
      current = false;
      animation.stop();
    };
  }, [active, appReady, nativeReleased, opacity, reducedMotion, visible]);

  return { visible, opacity, bars, onOverlayLayout, onLogoReady };
}
