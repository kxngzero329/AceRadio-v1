import { Platform, View, type ViewProps } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

/** Insets from React context survive iOS native-modal reparenting and slide transforms. */
export function ScreenSafeArea({ style, ...props }: ViewProps) {
  const insets = useSafeAreaInsets();
  if (Platform.OS === "ios") {
    return (
      <View
        {...props}
        style={[
          style,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      />
    );
  }
  // Preserve the existing Android/web layout, including native system-bar handling.
  return <SafeAreaView {...props} style={style} edges={["top", "bottom"]} />;
}
