import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable, type PressableProps } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Short press feedback on the UI thread; keeps the original button semantics. */
export function PlaybackButton({ style, onPressIn, onPressOut, ...props }: PressableProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (reducedMotion || props.disabled) {
      animation.current?.stop();
      opacity.setValue(1);
    }
  }, [props.disabled, reducedMotion, opacity]);
  useEffect(() => () => animation.current?.stop(), []);

  const animate = (pressed: boolean) => {
    animation.current?.stop();
    if (reducedMotion) { opacity.setValue(1); return; }
    animation.current = Animated.timing(opacity, {
      toValue: pressed ? 0.86 : 1,
      duration: pressed ? 90 : 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.current.start();
  };

  return (
    <Animated.View testID={props.testID ? `${props.testID}-feedback` : undefined} style={{ opacity }}>
      <Pressable
        {...props}
        onPressIn={event => { animate(true); onPressIn?.(event); }}
        onPressOut={event => { animate(false); onPressOut?.(event); }}
        style={style}
      />
    </Animated.View>
  );
}
