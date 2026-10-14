import { useCallback, useMemo, useRef } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";
import { useFocusEffect, useNavigation, useScrollToTop } from "expo-router";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Reset on entry; tapping the current tab also returns to the top. */
export function PageScrollView(props: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  const rootNavigation = useNavigation("/");
  const resetOnEntry = useRef(true);
  const reducedMotion = useReducedMotion();
  const topRef = useMemo(
    () => ({
      current: {
        scrollToTop: () =>
          scroll.current?.scrollTo({ y: 0, animated: !reducedMotion }),
      },
    }),
    [reducedMotion],
  );
  useScrollToTop(topRef);
  useFocusEffect(
    useCallback(() => {
      if (resetOnEntry.current)
        scroll.current?.scrollTo({ y: 0, animated: false });
      resetOnEntry.current = false;
      return () => {
        const state = rootNavigation.getState();
        // Tab changes reset the next visit. A player/detail overlay preserves the page underneath.
        resetOnEntry.current = state?.routes[state.index]?.name === "(tabs)";
      };
    }, [rootNavigation]),
  );
  return <ScrollView {...props} ref={scroll} />;
}
