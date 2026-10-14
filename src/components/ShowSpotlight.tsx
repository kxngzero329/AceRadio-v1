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
import { ShowPoster } from "@/components/ShowPoster";
import { shows } from "@/data/shows";
import { colors } from "@/theme/colors";

const slides = shows.filter((show) => show.poster);
const INTERVAL_MS = 5500;

const SpotlightSlide = memo(function SpotlightSlide({
  show,
  width,
}: {
  show: (typeof slides)[number];
  width: number;
}) {
  const openShow = useCallback(
    () => router.push({ pathname: "/show/[id]", params: { id: show.id } }),
    [show.id],
  );
  return (
    <Pressable
      style={{ width }}
      onPress={openShow}
      accessibilityRole="button"
      accessibilityLabel={`Explore ${show.title}. ${show.presenter}. ${show.schedule}.`}
    >
      <ShowPoster show={show} />
    </Pressable>
  );
});

export const ShowSpotlight = memo(function ShowSpotlight() {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const [reduceMotion, setReduceMotion] = useState(false);
  const list = useRef<ScrollView>(null);
  const resetting = useRef(false);
  const target = useRef<number | null>(null);
  const moving = useRef(false);
  const gesture = useRef(false);
  // Keep only the previous, current and next posters mounted, regardless of lineup size.
  const pages = useMemo(
    () =>
      slides.length > 1
        ? [-1, 0, 1].map(
            (step) => slides[(index + step + slides.length) % slides.length],
          )
        : slides,
    [index],
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
  }, [index, width]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    let mounted = true;
    const motionChanged = (enabled: boolean) => {
      if (!mounted) return;
      setReduceMotion(enabled);
      if (enabled) setAutoplay(false);
    };
    const screenReaderChanged = (enabled: boolean) => {
      if (mounted && enabled) setAutoplay(false);
    };
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(motionChanged)
      .catch(() => {});
    // React Native Web always reports true here; it cannot detect a browser screen reader.
    if (Platform.OS !== "web")
      void AccessibilityInfo.isScreenReaderEnabled()
        .then(screenReaderChanged)
        .catch(() => {});
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      motionChanged,
    );
    const reader = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      screenReaderChanged,
    );
    const app = AppState.addEventListener("change", (state) =>
      setAppActive(state === "active"),
    );
    return () => {
      mounted = false;
      motion.remove();
      reader.remove();
      app.remove();
    };
  }, []);

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
  }, []);

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
    [reduceMotion, settle, width],
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
  }, [advance, autoplay, focused, appActive, index, interacting, width]);

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
  const aspectRatio = imageAspectRatio(slides[0].poster!, 2);

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
            {pages.map((show, page) => (
              <SpotlightSlide key={page} show={show} width={width} />
            ))}
          </ScrollView>
        </View>
      )}
      <View style={styles.controls}>
        <Pressable
          style={styles.arrow}
          onPress={() => advance(-1)}
          disabled={interacting || slides.length < 2}
          accessibilityRole="button"
          accessibilityLabel="Previous show"
        >
          <ChevronLeft size={22} color={colors.white} />
        </Pressable>
        <View style={styles.progress}>
          <View style={styles.dots} accessible={false}>
            {slides.map((slide, page) => (
              <View
                key={slide.id}
                style={[styles.dot, page === index && styles.activeDot]}
              />
            ))}
          </View>
          <Text style={styles.count}>
            {index + 1} / {slides.length}
          </Text>
        </View>
        <Pressable
          style={styles.arrow}
          onPress={() => advance(1)}
          disabled={interacting || slides.length < 2}
          accessibilityRole="button"
          accessibilityLabel="Next show"
        >
          <ChevronRight size={22} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { width: "100%", marginBottom: 28 },
  artwork: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  list: { flexGrow: 0, flexShrink: 0 },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 6,
    gap: 4,
  },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  progress: { flex: 1, alignItems: "center", gap: 5 },
  dots: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },
  activeDot: { width: 12, backgroundColor: colors.green },
  count: { color: colors.muted, fontSize: 10, fontVariant: ["tabular-nums"] },
});
