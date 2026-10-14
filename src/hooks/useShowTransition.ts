import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform } from "react-native";
import type { Show } from "@/types/show";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Keep the previous show visible until its fade finishes, even during rapid skipping. */
export function useShowTransition(show: Show | null) {
  const [displayedShow, setDisplayedShow] = useState(show);
  const previous = useRef(show);
  const fade = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (previous.current?.id === show?.id) {
      fade.setValue(1);
      return;
    }
    if (!previous.current || !show || reducedMotion) {
      previous.current = show;
      setDisplayedShow(show);
      fade.setValue(1);
      return;
    }
    let frame: number | undefined;
    let entering: Animated.CompositeAnimation | undefined;
    const leaving = Animated.timing(fade, {
      toValue: 0,
      duration: 110,
      useNativeDriver: Platform.OS !== "web",
      easing: Easing.inOut(Easing.quad),
      isInteraction: false,
    });
    leaving.start(({ finished }) => {
      if (!finished) return;
      previous.current = show;
      setDisplayedShow(show);
      frame = requestAnimationFrame(() => {
        entering = Animated.timing(fade, {
          toValue: 1,
          duration: 230,
          useNativeDriver: Platform.OS !== "web",
          easing: Easing.out(Easing.cubic),
          isInteraction: false,
        });
        entering.start();
      });
    });
    return () => {
      leaving.stop();
      entering?.stop();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [show, fade, reducedMotion]);

  return { displayedShow, fade };
}
