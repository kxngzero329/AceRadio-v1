import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ExternalLink } from "lucide-react-native";
import { openVerifiedLink } from "@/services/links";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { layout } from "@/theme/layout";

export function ExternalContentButton({
  label,
  url,
}: {
  label: string;
  url: string;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function open() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      setFailed(!(await openVerifiedLink(label, url)));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => void open()}
        accessibilityRole="link"
        accessibilityLabel={label}
        disabled={busy}
        accessibilityState={{ disabled: busy, busy }}
        aria-busy={busy}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.pressed,
          busy && styles.busy,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <ExternalLink size={18} color={colors.onAccent} />
        )}
        <Text style={styles.label}>{busy ? "Opening…" : label}</Text>
      </Pressable>
      {failed && (
        <Text style={styles.error} accessibilityRole="alert">
          Couldn’t open this link. Please try again.
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { gap: 8, marginTop: 16 },
  button: {
    minHeight: 50,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.accent,
    borderRadius: layout.controlRadius,
  },
  label: {
    color: colors.onAccent,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.semibold,
    flexShrink: 1,
    textAlign: "center",
  },
  pressed: { backgroundColor: colors.accentPressed },
  busy: { opacity: 0.7 },
  error: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
});
