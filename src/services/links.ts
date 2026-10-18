import { Alert, Linking, Platform } from "react-native";
export async function openVerifiedLink(
  label: string,
  url: string,
): Promise<boolean> {
  if (!url || !(url.startsWith("https://") || url.startsWith("mailto:"))) {
    Alert.alert(
      `${label} link needed`,
      `Ask AceRadio for its official ${label} URL, then configure it in .env.`,
    );
    return false;
  }
  try {
    // Availability queries can fail under native package-visibility rules even
    // when opening the URL works. Let the OS handle the link directly.
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(
      "Unable to open link",
      `Could not open the ${label} link right now.`,
    );
    return false;
  }
}

/** Open the installed WhatsApp chat first, with its official HTTPS fallback. */
export async function openWhatsAppChat(url: string): Promise<boolean> {
  const match = /^https:\/\/wa\.me\/([1-9]\d{6,14})\/?$/.exec(url);
  if (!match) {
    Alert.alert("WhatsApp unavailable", "The studio’s WhatsApp link is not configured correctly.");
    return false;
  }
  if (Platform.OS !== "web") {
    try {
      await Linking.openURL(`whatsapp://send?phone=${match[1]}`);
      return true;
    } catch {
      // WhatsApp may not be installed. HTTPS can open its web/install flow.
    }
  }
  return openVerifiedLink("WhatsApp", url);
}
