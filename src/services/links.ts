import { Alert, Linking } from "react-native";
export async function openVerifiedLink(label: string, url: string) {
  if (!url || !(url.startsWith("https://") || url.startsWith("mailto:"))) {
    Alert.alert(
      `${label} link needed`,
      `Ask AceRadio for its official ${label} URL, then configure it in .env.`,
    );
    return;
  }
  try {
    if (!(await Linking.canOpenURL(url))) throw new Error("Unsupported URL");
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      "Unable to open link",
      `Could not open the ${label} link right now.`,
    );
  }
}
