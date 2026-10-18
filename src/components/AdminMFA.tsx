import { fonts } from "@/theme/fonts";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";
import { getAuthClient } from "@/services/authClient";
import { colors } from "@/theme/colors";

/** Secrets stay only in this component's memory; server policies require aal2 for admin writes. */
export function AdminMFA() {
  const [factor, setFactor] = useState<string | null>(null);
  const [setup, setSetup] = useState<{
    id: string;
    qr: string;
    secret: string;
  } | null>(null);
  const [level, setLevel] = useState("aal1");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const refresh = async () => {
    const [
      { data: factors, error: factorError },
      { data: assurance, error: levelError },
    ] = await Promise.all([
      getAuthClient().auth.mfa.listFactors(),
      getAuthClient().auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (!alive.current) return;
    if (factorError || levelError) throw Error("MFA unavailable.");
    setFactor(
      factors?.totp.find((item) => item.status === "verified")?.id ?? null,
    );
    setLevel(assurance?.currentLevel ?? "aal1");
  };
  useEffect(() => {
    alive.current = true;
    void refresh().catch(() => {
      if (alive.current)
        setError("Unable to load admin security. Try again shortly.");
    });
    return () => {
      alive.current = false;
    };
  }, []);
  const run = (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    void action()
      .catch(() => {
        if (alive.current)
          setError(
            "Unable to verify admin security. Check the current authenticator code and try again.",
          );
      })
      .finally(() => {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      });
  };
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Studio account security</Text>
      <Text style={styles.text}>
        {level === "aal2"
          ? "Two-step verification is active for this session."
          : factor
            ? "Enter your authenticator code to unlock admin actions for this session."
            : "Set up an authenticator app before using admin controls. Your regular favourites and settings still work."}
      </Text>
      {setup && (
        <>
          <View style={styles.qr}>
            <SvgXml xml={setup.qr} width={180} height={180} />
          </View>
          <Text style={styles.text}>
            Scan the QR code, or enter this setup key in your authenticator app:
          </Text>
          <Text selectable style={styles.secret}>
            {setup.secret}
          </Text>
        </>
      )}
      {level !== "aal2" && (factor || setup) && (
        <>
          <TextInput
            accessibilityLabel="Authenticator code"
            value={code}
            onChangeText={(value) =>
              setCode(value.replace(/\D/g, "").slice(0, 6))
            }
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="Six-digit authenticator code"
            placeholderTextColor={colors.subtle}
            selectionColor={colors.selection}
            cursorColor={colors.accent}
            style={styles.input}
            editable={!busy}
          />
          <Pressable
            accessibilityRole="button"
            disabled={busy || code.length !== 6}
            style={[
              styles.button,
              (busy || code.length !== 6) && styles.disabled,
            ]}
            onPress={() =>
              run(async () => {
                const { error } =
                  await getAuthClient().auth.mfa.challengeAndVerify({
                    factorId: setup?.id ?? factor!,
                    code,
                  });
                if (error) throw error;
                if (!alive.current) return;
                setSetup(null);
                setCode("");
                await refresh();
              })
            }
          >
            <Text style={styles.buttonText}>Verify admin session</Text>
          </Pressable>
        </>
      )}
      {level !== "aal2" && !factor && !setup && (
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          disabled={busy}
          onPress={() =>
            run(async () => {
              // Reuse an unverified factor after an interrupted setup rather than creating duplicates.
              const { data: factors, error: listError } =
                await getAuthClient().auth.mfa.listFactors();
              if (listError) throw listError;
              for (const item of factors?.all ?? [])
                if (item.factor_type === "totp" && item.status === "unverified")
                  await getAuthClient().auth.mfa.unenroll({
                    factorId: item.id,
                  });
              const { data, error } = await getAuthClient().auth.mfa.enroll({
                factorType: "totp",
                friendlyName: "AceRadio Studio",
              });
              if (error) throw error;
              const qr = data.totp.qr_code.startsWith("data:")
                ? data.totp.qr_code.slice(data.totp.qr_code.indexOf(",") + 1)
                : data.totp.qr_code;
              if (alive.current)
                setSetup({
                  id: data.id,
                  qr: qr.startsWith("%") ? decodeURIComponent(qr) : qr,
                  secret: data.totp.secret,
                });
            })
          }
        >
          <Text style={styles.buttonText}>Set up two-step verification</Text>
        </Pressable>
      )}
      {busy && <ActivityIndicator color={colors.accent} />}
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: {
    padding: 16,
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.white, fontFamily: fonts.displayBold, fontSize: 15 },
  text: { color: colors.muted, fontSize: 12, lineHeight: 19, fontFamily: fonts.regular },
  qr: { alignSelf: "center", backgroundColor: "#FFFFFF", padding: 12 },
  secret: { color: colors.white, fontSize: 13, fontFamily: fonts.regular },
  input: {
    minHeight: 48,
    color: colors.white,
    outlineColor: colors.accent,
    backgroundColor: colors.surface2,
    padding: 12,
    borderRadius: 10,
    fontSize: 16, fontFamily: fonts.regular,
  },
  button: {
    minHeight: 46,
    backgroundColor: colors.accentSoft,
    padding: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { color: colors.accent, fontFamily: fonts.semibold, fontSize: 13 },
  disabled: { opacity: 0.5 },
  error: { color: colors.error, fontSize: 12, lineHeight: 18, fontFamily: fonts.regular },
});
