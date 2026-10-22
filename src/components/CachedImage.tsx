import { useState } from "react";
import {
  Image as ExpoImage,
  type ImageProps as ExpoImageProps,
} from "expo-image";
import type { ImageProps } from "react-native";

type Props = Pick<
  ImageProps,
  | "source"
  | "style"
  | "resizeMode"
  | "accessible"
  | "accessibilityLabel"
  | "accessibilityRole"
  | "testID"
  | "onLoad"
  | "onError"
  | "onLoadEnd"
  | "fadeDuration"
>;

function sourceKey(source: Props["source"]): string {
  if (typeof source === "number") return `asset:${source}`;
  if (Array.isArray(source))
    return source.map((item) => item.uri ?? "").join("|");
  return source?.uri ?? "empty";
}

function CachedImageView({
  source,
  resizeMode,
  onLoad,
  onError,
  onLoadEnd,
  fadeDuration: _fade,
  ...props
}: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <ExpoImage
      {...props}
      source={
        failed
          ? require("../../assets/icons/icon.png")
          : (source as ExpoImageProps["source"])
      }
      cachePolicy="memory-disk"
      contentFit={
        failed
          ? "contain"
          : resizeMode === "stretch"
            ? "fill"
            : resizeMode === "center"
              ? "none"
              : resizeMode === "repeat"
                ? "cover"
                : (resizeMode ?? "cover")
      }
      transition={0}
      recyclingKey={sourceKey(source)}
      onLoad={(event) =>
        onLoad?.({
          nativeEvent: {
            source: {
              width: event.source.width,
              height: event.source.height,
              uri: event.source.url,
            },
          },
        } as Parameters<NonNullable<Props["onLoad"]>>[0])
      }
      onLoadEnd={() => onLoadEnd?.()}
      onError={(event) => {
        if (failed) return;
        // A local placeholder never creates a second network request or an
        // automatic Supabase failover during an R2 outage.
        setFailed(true);
        onError?.({ nativeEvent: { error: event.error } } as Parameters<
          NonNullable<Props["onError"]>
        >[0]);
      }}
    />
  );
}

/** Immutable image URLs share the native disk/memory cache across screens.
 * Web uses browser HTTP caching. OS eviction can require a later download. */
export function CachedImage(props: Props) {
  return <CachedImageView key={sourceKey(props.source)} {...props} />;
}
