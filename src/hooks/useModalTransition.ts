import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, useWindowDimensions } from "react-native";
import { useFocusEffect, useIsFocused, useNavigation, usePathname } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { blurWebFocus, router } from "@/utils/navigation";
import { registerModalHistoryListener } from "@/utils/modalHistory";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** One slide on the native UI thread; remove the route only after the sheet is offscreen. */
export function useModalTransition() {
  const native = Platform.OS !== "web";
  const navigation = useNavigation();
  const focused = useIsFocused();
  const pathname = usePathname();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const closing = useRef(false);
  const releasing = useRef(false);
  const pendingWebPop = useRef<PopStateEvent | null>(null);
  const webSheetPath = useRef<string | null>(null);
  const presented = useRef(false);
  const entered = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (closing.current) return;
      if (entered.current) {
        progress.setValue(1);
        setIsTransitioning(false);
        return;
      }
      // Prefetched native screens stay below the viewport until their first actual focus.
      if (!presented.current) progress.setValue(0);
      presented.current = true;
      setIsTransitioning(!reducedMotion);
      const entering = Animated.timing(progress, {
        toValue: 1,
        duration: reducedMotion ? 0 : 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: native,
        isInteraction: false,
      });
      animation.current = entering;
      entering.start(({ finished }) => {
        if (finished) {
          entered.current = true;
          setIsTransitioning(false);
        }
      });
      return () => {
        if (animation.current === entering) entering.stop();
      };
    }, [progress, reducedMotion, native]),
  );

  const dismiss = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);

  const finishExit = useCallback((onFinish: () => void) => {
    releasing.current = true;
    const pending = pendingWebPop.current;
    pendingWebPop.current = null;
    if (pending)
      window.dispatchEvent(new PopStateEvent("popstate", { state: pending.state }));
    else onFinish();
  }, []);

  const slideOut = useCallback(
    (onFinish: () => void) => {
      if (closing.current) return;
      closing.current = true;
      setIsClosing(true);
      setIsTransitioning(!reducedMotion);
      blurWebFocus();
      animation.current?.stop();
      if (reducedMotion) {
        progress.setValue(0);
        finishExit(onFinish);
        return;
      }
      animation.current = Animated.timing(progress, {
        toValue: 0,
        duration: 300,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: native,
        isInteraction: false,
      });
      animation.current.start(({ finished }) => {
        if (finished) {
          finishExit(onFinish);
        }
      });
    },
    [progress, reducedMotion, native, finishExit],
  );

  // Supported native-stack interception covers the down arrow and Android Back.
  // Redispatch the original action: navigation marks this route as already handled.
  usePreventRemove(focused || presented.current, ({ data }) => {
    if (releasing.current) navigation.dispatch(data.action);
    else slideOut(() => navigation.dispatch(data.action));
  });

  useEffect(() => {
    if (native || !focused) return;
    // Router state is current before Expo finishes synchronizing the browser URL.
    const sheetPath = (webSheetPath.current ??= pathname);
    const beforeBrowserNavigation = (event: PopStateEvent) => {
      if (releasing.current) return;
      const destination = window.location.pathname;
      if (destination === sheetPath) {
        // Forward during a pending Back returns to this sheet; restore its entrance.
        if (pendingWebPop.current) {
          pendingWebPop.current = null;
          animation.current?.stop();
          closing.current = false;
          setIsClosing(false);
          setIsTransitioning(!reducedMotion);
          animation.current = Animated.timing(progress, {
            toValue: 1,
            duration: reducedMotion ? 0 : 300,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
            isInteraction: false,
          });
          animation.current.start(({ finished }) => {
            if (finished) setIsTransitioning(false);
          });
        }
        return;
      }
      // Browser history restores nested state directly, which can bypass beforeRemove.
      // Hold its event until the sheet exits, then let Expo handle the latest destination.
      event.stopImmediatePropagation();
      pendingWebPop.current = event;
      slideOut(() => {});
    };
    return registerModalHistoryListener(beforeBrowserNavigation);
  }, [focused, native, pathname, progress, reducedMotion, slideOut]);

  useEffect(() => () => animation.current?.stop(), []);
  const close = useCallback(() => {
    if (!closing.current) dismiss();
  }, [dismiss]);
  return {
    close,
    isClosing,
    isTransitioning,
    style: {
      transform: [
        {
          translateY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [height, 0],
          }),
        },
      ],
    },
  };
}
