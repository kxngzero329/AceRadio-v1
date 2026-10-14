import { Asset } from "expo-asset";
import type { ImageSourcePropType } from "react-native";

/** Expo asset metadata is available on web and native without loading the image. */
export function imageAspectRatio(
  source: ImageSourcePropType,
  fallback: number,
) {
  const metadata =
    typeof source === "number"
      ? Asset.fromModule(source)
      : Array.isArray(source)
        ? source[0]
        : source;
  return metadata?.width && metadata?.height
    ? metadata.width / metadata.height
    : fallback;
}
