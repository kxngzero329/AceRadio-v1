import { fonts } from "@/theme/fonts";
import { useRef, useState } from "react";
import { findNodeHandle, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Share2 } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import type { Show } from "@/types/show";

/** Client-only sharing through the existing app scheme; no hosted link service. */
export function ShowShareButton({ show, disabled }: { show: Show; disabled?: boolean }) {
  const button = useRef<View>(null);
  const sharing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState(false);
  const link = `aceradio://show/${encodeURIComponent(show.id)}`;
  const description = `${show.title} with ${show.presenter} on AceRadio\n${show.schedule} · SAST`;
  const message = `${description}\n\nOpen in the AceRadio app:\n${link}`;

  async function share() {
    if (sharing.current || disabled) return;
    sharing.current = true;
    setBusy(true);
    setFeedback(null);
    setManualCopy(false);
    try {
      if (Platform.OS === "web" && typeof navigator.share !== "function") {
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(message);
            setFeedback("Show details and app link copied. Paste them into a message.");
            return;
          } catch {
            // Clipboard access can be blocked by browser permissions.
          }
        }
        setManualCopy(true);
        setFeedback("Select and copy the show details below to share them.");
        return;
      }
      const anchor = Platform.OS === "ios" ? findNodeHandle(button.current) : null;
      await Share.share(
        Platform.OS === "ios"
          ? { title: show.title, message: description, url: link }
          : { title: show.title, message },
        { dialogTitle: `Share ${show.title}`, subject: `${show.title} on AceRadio`, ...(anchor != null ? { anchor } : {}) },
      );
    } catch (error) {
      // Closing the browser's share sheet is a normal cancellation.
      if (!(error instanceof Error && error.name === "AbortError")) {
        setFeedback("Couldn’t open sharing. Please try again.");
      }
    } finally {
      sharing.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.section}>
      <Pressable
        ref={button}
        testID="show-share"
        accessibilityRole="button"
        accessibilityLabel={`Share ${show.title}`}
        accessibilityHint="Share the show details and a link for people with AceRadio installed."
        accessibilityState={{ disabled: !!disabled || busy, busy }}
        disabled={disabled || busy}
        onPress={share}
        style={({ pressed }) => [styles.button, pressed && styles.pressed, (disabled || busy) && styles.disabled]}
      >
        <Share2 size={18} color={colors.white} />
        <Text style={styles.label}>{busy ? "Opening sharing…" : "Share show"}</Text>
      </Pressable>
      <Text style={styles.hint}>Send to a friend with AceRadio installed.</Text>
      {feedback && <Text testID="show-share-feedback" style={styles.hint} accessibilityLiveRegion="polite">{feedback}</Text>}
      {manualCopy && <Text testID="show-share-copy" style={styles.copy} selectable>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 12, gap: 6 },
  button: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, padding: 12, borderRadius: layout.controlRadius, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  label: { color: colors.white, fontSize: 14, fontFamily: fonts.semibold, flexShrink: 1 },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", fontFamily: fonts.medium },
  copy: { color: colors.white, fontSize: 13, lineHeight: 20, padding: 12, borderRadius: layout.controlRadius, backgroundColor: colors.surface2, fontFamily: fonts.regular },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.5 },
});
