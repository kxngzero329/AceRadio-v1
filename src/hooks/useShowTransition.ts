import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform } from "react-native";
import type { Show } from "@/types/show";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motion } from "@/theme/motion";

/** Fade metadata without restarting for catalogue refreshes or stale completions. */
export function useShowTransition(show: Show | null) {
  const [displayedShow, setDisplayedShow] = useState(show);
  const previous = useRef(show);
  const latest = useRef(show);
  const transitioning = useRef(false);
  latest.current = show;
  const fade = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const commit = () => {
      previous.current = latest.current;
      setDisplayedShow(latest.current);
    };
    if (!show || reducedMotion) {
      transitioning.current = false;
      previous.current = show;
      setDisplayedShow(show);
      fade.setValue(1);
      return;
    }
    if (previous.current?.id === show.id && !transitioning.current) return;
    transitioning.current = true;
    let active = true;
    let frame: number | undefined;
    let leaving: Animated.CompositeAnimation | undefined;
    let entering: Animated.CompositeAnimation | undefined;
    const enter = () => {
      frame = requestAnimationFrame(() => {
        if (!active) return;
        entering = Animated.timing(fade, {
          toValue: 1,
          duration: motion.metadataIn,
          useNativeDriver: Platform.OS !== "web",
          easing: Easing.out(Easing.cubic),
          isInteraction: false,
        });
        entering.start(({ finished }) => {
          if (active && finished) transitioning.current = false;
        });
      });
    };
    if (previous.current?.id === show.id) {
      // Also recover a partly faded show if the user returns to it mid-transition.
      enter();
    } else if (!previous.current) {
      commit();
      fade.setValue(0);
      enter();
    } else {
      leaving = Animated.timing(fade, {
        toValue: 0,
        duration: motion.metadataOut,
        useNativeDriver: Platform.OS !== "web",
        easing: Easing.inOut(Easing.quad),
        isInteraction: false,
      });
      leaving.start(({ finished }) => {
        if (!active || !finished) return;
        commit();
        enter();
      });
    }
    return () => {
      active = false;
      leaving?.stop();
      entering?.stop();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [show?.id, fade, reducedMotion]);

  useEffect(() => {
    // Same-show metadata refreshes should update copy without flashing or
    // cancelling a fade that is still running.
    if (previous.current?.id === show?.id) {
      previous.current = show;
      setDisplayedShow(show);
    }
  }, [show]);

  return { displayedShow, fade };
}
