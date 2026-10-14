import { Image, StyleSheet, type ImageProps } from "react-native";

type FittedImageProps = Pick<
  ImageProps,
  "source" | "accessibilityLabel" | "onLoad" | "onError"
>;

/** The parent provides the frame; always override a bundled image's intrinsic size. */
export function FittedImage(props: FittedImageProps) {
  return (
    <Image
      {...props}
      resizeMode="contain"
      accessibilityRole="image"
      style={styles.image}
    />
  );
}

const styles = StyleSheet.create({
  // Absolute positioning alone leaves the source's width/height (e.g. 1600x800) intact.
  image: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
});
