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

const SpotlightSlide = memo(function SpotlightSlide({ banner, width, loadImage }: { banner: Banner; width: number; loadImage: boolean }) {
  const openBanner = useCallback(() => {
    if (banner.showId) router.push({ pathname: "/show/[id]", params: { id: banner.showId } });
    else if (banner.linkUrl) void openVerifiedLink(banner.title, banner.linkUrl);
  }, [banner]);
  return (
    <Pressable style={({ pressed }) => ({ width, aspectRatio: imageAspectRatio(banner.image, 2), opacity: pressed ? 0.8 : 1 })} onPress={openBanner}
      disabled={!banner.showId && !banner.linkUrl} accessibilityRole={banner.showId || banner.linkUrl ? "button" : undefined}
      accessibilityLabel={`${banner.title}. ${banner.subtitle ?? ""}`}>
      {loadImage && <FittedImage source={banner.image} accessibilityLabel={banner.title} />}
    </Pressable>
  );
});

export const ShowSpotlight = memo(function ShowSpotlight() {
  const { banners } = useContent();
  const slides = useMemo(() => banners.filter(banner => banner.placement === "home_spotlight"), [banners]);
  const slideIds = slides.map(slide => slide.id).join("|");
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const reduceMotion = useReducedMotion();
  const list = useRef<ScrollView>(null);
  const resetting = useRef<number | null>(null);
  const currentPage = useRef(slides.length > 1 ? 1 : 0);
  const previousIds = useRef(slideIds);
  const target = useRef<number | null>(null);
  const moving = useRef(false);
  const gesture = useRef(false);
  const safeIndex = slides.length ? index % slides.length : 0;
  // Every page keeps the same banner and native Image. Swapping three image
  // sources while recentering the native scroll view can flash the old artwork.
  // The two boundary copies make looping seamless; only nearby artwork loads.
  const pages = useMemo(
    () =>
      slides.length > 1
        ? [slides[slides.length - 1], ...slides, slides[0]]
        : slides,
    [slides],
  );
  const initialOffset = useMemo(() => ({ x: slides.length > 1 ? width : 0, y: 0 }), [width, slides.length]);

  useLayoutEffect(() => {
    if (width <= 0) return;
    if (previousIds.current !== slideIds) {
      previousIds.current = slideIds;
      currentPage.current = slides.length > 1 ? 1 : 0;
      setIndex(0);
      setVisibleIndex(0);
    }
    target.current = null;
    moving.current = false;
    gesture.current = false;
    resetting.current = null;
    setInteracting(false);
    list.current?.scrollTo({
      x: currentPage.current * width,
      animated: false,
    });
  }, [slideIds, slides.length, width]);

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
    if (resetting.current !== null || !slides.length) return;
    const bounded = Math.max(0, Math.min(page, slides.length + 1));
    const realPage = slides.length < 2 ? 0 : bounded === 0 ? slides.length : bounded === slides.length + 1 ? 1 : bounded;
    currentPage.current = realPage;
    const nextIndex = slides.length > 1 ? realPage - 1 : 0;
    setIndex(nextIndex);
    setVisibleIndex(nextIndex);
    target.current = null;
    moving.current = false;
    gesture.current = false;
    setInteracting(realPage !== bounded);
    if (realPage !== bounded) {
      // The destination and boundary copy already contain identical artwork.
      // Wait for the native offset acknowledgement, rather than a JS frame.
      resetting.current = realPage;
      list.current?.scrollTo({ x: realPage * width, animated: false });
    }
  }, [slides.length, width]);

  const advance = useCallback(
    (direction: number) => {
      if (
        resetting.current !== null ||
        moving.current ||
        !list.current ||
        width <= 0 ||
        slides.length < 2
      )
        return;
      const next = currentPage.current + direction;
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
    const offset = event.nativeEvent.contentOffset.x;
    if (width <= 0) return;
    if (resetting.current !== null) {
      if (Math.abs(offset - resetting.current * width) < 1) {
        resetting.current = null;
        setInteracting(false);
      }
      return;
    }
    const page = Math.max(0, Math.min(Math.round(offset / width), pages.length - 1));
    setVisibleIndex(slides.length > 1 ? (page - 1 + slides.length) % slides.length : 0);
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
      if (Math.abs(offset - page * width) < 1) settle(page);
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
            contentOffset={initialOffset}
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
            {pages.map((banner, page) => {
              const bannerIndex = slides.length > 1 ? (page - 1 + slides.length) % slides.length : 0;
              const distance = Math.abs(bannerIndex - visibleIndex);
              const loadImage = Math.min(distance, slides.length - distance) <= 2;
              return <SpotlightSlide key={`${page === 0 ? "leading" : page === pages.length - 1 ? "trailing" : "slide"}:${banner.id}`} banner={banner} width={width} loadImage={loadImage} />;
            })}
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
