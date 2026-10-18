import { fonts } from "@/theme/fonts";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  AppState,
  ScrollView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { imageAspectRatio } from "@/utils/imageAspectRatio";
import { useFocusEffect } from "expo-router";
import { router } from "@/utils/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { FittedImage } from "@/components/FittedImage";
import type { Banner } from "@/types/content";
import { openVerifiedLink } from "@/services/links";
import { useContent } from "@/context/ContentContext";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const INTERVAL_MS = 5500;

const SpotlightSlide = memo(function SpotlightSlide({ banner, width }: { banner: Banner; width: number }) {
  const openBanner = useCallback(() => {
    if (banner.showId) router.push({ pathname: "/show/[id]", params: { id: banner.showId } });
    else if (banner.linkUrl) void openVerifiedLink(banner.title, banner.linkUrl);
  }, [banner]);
  return (
    <Pressable style={({ pressed }) => ({ width, aspectRatio: imageAspectRatio(banner.image, 2), opacity: pressed ? 0.8 : 1 })} onPress={openBanner}
      disabled={!banner.showId && !banner.linkUrl} accessibilityRole={banner.showId || banner.linkUrl ? "button" : undefined}
      accessibilityLabel={`${banner.title}. ${banner.subtitle ?? ""}`}>
      <FittedImage source={banner.image} accessibilityLabel={banner.title} />
    </Pressable>
  );
});

export const ShowSpotlight = memo(function ShowSpotlight() {
  const { banners } = useContent();
  const slides = useMemo(() => banners.filter(banner => banner.placement === "home_spotlight"), [banners]);
  const slideIds = slides.map(slide => slide.id).join("|");
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const reduceMotion = useReducedMotion();
  const list = useRef<ScrollView>(null);
  const resetting = useRef(false);
  const target = useRef<number | null>(null);
  const moving = useRef(false);
  const gesture = useRef(false);
  const safeIndex = slides.length ? index % slides.length : 0;
  useEffect(() => {
    target.current = null;
    moving.current = false;
    gesture.current = false;
    setInteracting(false);
    setIndex(0);
  }, [slideIds]);
  // Keep only the previous, current and next banners mounted.
  const pages = useMemo(
    () =>
      slides.length > 1
        ? [-1, 0, 1].map(
            (step) => slides[(safeIndex + step + slides.length) % slides.length],
          )
        : slides,
    [safeIndex, slides],
  );

  useLayoutEffect(() => {
    if (width <= 0) return;
    resetting.current = true;
    list.current?.scrollTo({
      x: slides.length > 1 ? width : 0,
      animated: false,
    });
    const frame = requestAnimationFrame(() => {
      resetting.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [safeIndex, slideIds, slides.length, width]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    let mounted = true;
    const screenReaderChanged = (enabled: boolean) => {
      if (mounted && enabled) setAutoplay(false);
    };
    // React Native Web always reports true here; it cannot detect a browser screen reader.
    if (Platform.OS !== "web")
      void AccessibilityInfo.isScreenReaderEnabled()
        .then(screenReaderChanged)
        .catch(() => {});
    const reader = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      screenReaderChanged,
    );
    const app = AppState.addEventListener("change", (state) =>
      setAppActive(state === "active"),
    );
    return () => {
      mounted = false;
      reader.remove();
      app.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) setAutoplay(false);
  }, [reduceMotion]);

  const settle = useCallback((page: number) => {
    if (resetting.current) return;
    const step = slides.length > 1 ? Math.max(0, Math.min(page, 2)) - 1 : 0;
    if (step !== 0) {
      resetting.current = true;
      setIndex((current) => (current + step + slides.length) % slides.length);
    }
    target.current = null;
    moving.current = false;
    gesture.current = false;
    setInteracting(false);
  }, [slides.length]);

  const advance = useCallback(
    (direction: number) => {
      if (
        resetting.current ||
        moving.current ||
        !list.current ||
        width <= 0 ||
        slides.length < 2
      )
        return;
      const next = 1 + direction;
      moving.current = true;
      target.current = next;
      setInteracting(true);
      list.current.scrollTo({ x: next * width, animated: !reduceMotion });
      if (reduceMotion) settle(next);
    },
    [reduceMotion, settle, width, slides.length],
  );

  useEffect(() => {
    if (
      !autoplay ||
      !focused ||
      !appActive ||
      interacting ||
      width <= 0 ||
      slides.length < 2
    )
      return;
    const timer = setTimeout(() => advance(1), INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [advance, autoplay, focused, appActive, safeIndex, interacting, width, slides.length]);

  const finishScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (
      width > 0 &&
      (moving.current || gesture.current || target.current !== null)
    )
      settle(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const trackScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (resetting.current) return;
    const offset = event.nativeEvent.contentOffset.x;
    // Also finish programmatic scrolling on platforms that omit momentum-end events.
    if (
      target.current !== null &&
      Math.abs(offset - target.current * width) < 1
    ) {
      settle(target.current);
    } else if (
      width > 0 &&
      !moving.current &&
      (gesture.current || Platform.OS === "web")
    ) {
      // Browsers use CSS scroll snapping and do not emit native drag/momentum events.
      const page = Math.round(offset / width);
      if (page !== 1 && Math.abs(offset - page * width) < 1) settle(page);
    }
  };

  if (!slides.length) return null;
  const aspectRatio = imageAspectRatio(slides[0].image, 2);

  return (
    <View
      testID="show-spotlight"
      style={styles.root}
      onLayout={(event) => {
        const measuredWidth = event.nativeEvent.layout.width;
        if (measuredWidth !== width) {
          target.current = null;
          moving.current = false;
          gesture.current = false;
          setInteracting(false);
          setWidth(measuredWidth);
        }
      }}
    >
      {width > 0 && (
        <View style={styles.artwork}>
          <ScrollView
            ref={list}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            contentOffset={{ x: slides.length > 1 ? width : 0, y: 0 }}
            scrollEnabled={slides.length > 1}
            style={[styles.list, { height: width / aspectRatio }]}
            scrollEventThrottle={16}
            onScroll={trackScroll}
            onTouchStart={
              Platform.OS === "web"
                ? () => {
                    target.current = null;
                    gesture.current = true;
                    moving.current = false;
                    setInteracting(true);
                  }
                : undefined
            }
            onTouchEnd={
              Platform.OS === "web" ? () => setInteracting(false) : undefined
            }
            onTouchCancel={
              Platform.OS === "web"
                ? () => {
                    gesture.current = false;
                    moving.current = false;
                    setInteracting(false);
                  }
                : undefined
            }
            onScrollBeginDrag={() => {
              target.current = null;
              gesture.current = true;
              moving.current = true;
              setInteracting(true);
            }}
            onScrollEndDrag={(event) => {
              moving.current = false;
              setInteracting(false);
              trackScroll(event);
            }}
            onMomentumScrollBegin={() => {
              moving.current = true;
              setInteracting(true);
            }}
            onMomentumScrollEnd={finishScroll}
          >
            {pages.map((banner, page) => (
              <SpotlightSlide key={page} banner={banner} width={width} />
            ))}
          </ScrollView>
        </View>
      )}
      {slides.length > 1 && <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed, interacting && styles.arrowDisabled]}
          onPress={() => advance(-1)}
          disabled={interacting || slides.length < 2}
          accessibilityRole="button"
          accessibilityLabel="Previous show"
          accessibilityState={{ disabled: interacting }}
        >
          <ChevronLeft size={22} color={colors.white} />
        </Pressable>
        <View style={styles.progress} accessible accessibilityRole="adjustable"
          accessibilityLabel={`Show spotlight: ${slides[safeIndex].title}`}
          accessibilityValue={{ min: 1, max: slides.length, now: safeIndex + 1, text: `Slide ${safeIndex + 1} of ${slides.length}` }}
          accessibilityActions={[{ name: "increment", label: "Next show" }, { name: "decrement", label: "Previous show" }]}
          onAccessibilityAction={event => advance(event.nativeEvent.actionName === "increment" ? 1 : -1)}>
          <Text style={styles.count}>
            {safeIndex + 1} / {slides.length}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed, interacting && styles.arrowDisabled]}
          onPress={() => advance(1)}
          disabled={interacting || slides.length < 2}
          accessibilityRole="button"
          accessibilityLabel="Next show"
          accessibilityState={{ disabled: interacting }}
        >
          <ChevronRight size={22} color={colors.white} />
        </Pressable>
      </View>}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { alignSelf: "stretch", marginHorizontal: -8, marginBottom: 24 },
  artwork: {
    width: "100%",
    borderRadius: layout.cardRadius,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  list: { flexGrow: 0, flexShrink: 0 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    gap: 8,
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowPressed: { backgroundColor: colors.surface2 },
  arrowDisabled: { opacity: 0.4 },
  progress: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
  count: { color: colors.muted, fontSize: 12, fontFamily: fonts.semibold, fontVariant: ["tabular-nums"], letterSpacing: 1 },
});
