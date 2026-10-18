import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, View, type ImageSourcePropType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AceLogo } from "@/components/AceLogo";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { STATION_STREAM_SHOW_ID } from "@/data/stationShow";
import { colors } from "@/theme/colors";
import { motion } from "@/theme/motion";
import type { Show } from "@/types/show";

type Artwork = { key: string; showId: string | null; source?: ImageSourcePropType; station: boolean };
type Variant = "hero" | "cover";

function ArtworkLayer({ artwork, incoming, variant, onStart, onComplete, onReady }: {
  artwork: Artwork;
  incoming: boolean;
  variant: Variant;
  onStart: (key: string) => void;
  onComplete: (artwork: Artwork) => void;
  onReady: (showId: string | null) => void;
}) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(incoming ? 0 : 1)).current;
  const [loaded, setLoaded] = useState(!artwork.source);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!incoming) {
      opacity.setValue(1);
      return;
    }
    if (!loaded) return;
    let active = true;
    onReady(artwork.showId);
    onStart(artwork.key);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: reducedMotion ? 0 : motion.artwork,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (active && finished) onComplete(artwork);
    });
    return () => { active = false; animation.stop(); };
  }, [artwork, incoming, loaded, onComplete, onReady, onStart, opacity, reducedMotion]);

  const station = artwork.station || failed;
  const imageTestID = variant === "hero"
    ? station ? "live-radio-background-artwork" : "live-show-artwork"
    : "full-player-artwork";
  return (
    <Animated.View
      testID={`${variant}-artwork-${incoming ? "incoming" : "current"}`}
      style={[styles.layer, {
        opacity,
        transform: [{ scale: reducedMotion ? 1 : opacity.interpolate({ inputRange: [0, 1], outputRange: [1.015, 1], extrapolate: "clamp" }) }],
      }]}
    >
      {artwork.source && !failed ? (
        <Image
          testID={imageTestID}
          source={artwork.source}
          style={[styles.image, variant === "hero" && { opacity: station ? 0.5 : 0.75 }]}
          resizeMode={variant === "cover" || station ? "contain" : "cover"}
          fadeDuration={0}
          accessible={false}
          onLoad={() => setLoaded(true)}
          onError={() => { setFailed(true); setLoaded(true); }}
        />
      ) : variant === "cover" || failed || !!artwork.showId ? <AceLogo width={150} /> : null}
      {variant === "hero" && (
        <LinearGradient
          colors={station || !artwork.source ? ["#00000030", "#00000055", "#0000009C"] : ["#00000066", "#000000A6", "#000000EB"]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      )}
    </Animated.View>
  );
}

/** Keep the decoded artwork below its replacement; at most two layers are mounted. */
export function PlaybackArtwork({ show, variant, onReady }: {
  show: Show | null;
  variant: Variant;
  onReady?: (showId: string | null) => void;
}) {
  const station = show?.id === STATION_STREAM_SHOW_ID;
  const source = show ? station ? require("../../assets/icons/icon.png") : show.image ?? show.poster : undefined;
  const key = `${show?.id ?? "empty"}:${JSON.stringify(source)}`;
  const requested = useMemo<Artwork>(() => ({ key, showId: show?.id ?? null, source, station }), [key]);
  const [base, setBase] = useState<Artwork | null>({ key: "empty:undefined", showId: null, station: false });
  const [incoming, setIncoming] = useState<Artwork | null>(show ? requested : null);
  const [revealing, setRevealing] = useState(false);
  const activeKey = useRef(incoming?.key);
  activeKey.current = incoming?.key;
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;

  useEffect(() => {
    // Finish the current short reveal, then use the latest request. Do not tear
    // down a partly visible image when playback/metadata changes rapidly.
    if (revealing) return;
    if (base?.key === requested.key) {
      if (incoming) setIncoming(null);
    } else if (incoming?.key !== requested.key) {
      setIncoming(requested);
      setRevealing(false);
    }
  }, [base, incoming, requested, revealing]);

  const start = useCallback((key: string) => {
    if (activeKey.current === key) setRevealing(true);
  }, []);
  const ready = useCallback((showId: string | null) => readyCallback.current?.(showId), []);
  const complete = useCallback((artwork: Artwork) => {
    if (activeKey.current !== artwork.key) return;
    setBase(artwork);
    setIncoming(null);
    setRevealing(false);
  }, []);

  return (
    <View
      testID={`${variant}-artwork-transition`}
      pointerEvents="none"
      accessible={variant === "cover"}
      accessibilityRole={variant === "cover" ? "image" : undefined}
      accessibilityLabel={variant === "cover" ? `${show?.title ?? "AceRadio live broadcast"} artwork` : undefined}
      accessibilityElementsHidden={variant === "hero"}
      importantForAccessibility={variant === "hero" ? "no-hide-descendants" : "auto"}
      style={styles.frame}
    >
      {[base, incoming].map(artwork => artwork && (
        <ArtworkLayer key={artwork.key} artwork={artwork} incoming={artwork === incoming}
          variant={variant} onStart={start} onComplete={complete} onReady={ready} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, overflow: "hidden" },
  layer: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  image: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
});
