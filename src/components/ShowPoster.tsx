import { memo } from "react";
import { StyleSheet, View, type ImageProps } from "react-native";
import { imageAspectRatio } from "@/utils/imageAspectRatio";
import { FittedImage } from "@/components/FittedImage";
import type { Show } from "@/types/show";
import { colors } from "@/theme/colors";

type ShowPosterProps = { show: Show } & Pick<ImageProps, "onLoad" | "onError">;

export const ShowPoster = memo(function ShowPoster({
  show,
  onLoad,
  onError,
}: ShowPosterProps) {
  if (!show.poster) return null;

  const aspectRatio = imageAspectRatio(show.poster, 2);

  return (
    <View style={[styles.frame, { aspectRatio }]}>
      <FittedImage
        source={show.poster}
        accessibilityLabel={`${show.title}: ${show.presenter}. ${show.schedule}.`}
        onLoad={onLoad}
        onError={onError}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { width: "100%", flexShrink: 0, backgroundColor: colors.surface },
});
