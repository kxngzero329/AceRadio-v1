import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Eye, EyeOff, ShieldCheck } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAccountData } from "@/context/AccountDataContext";
import { AccountSyncStatus } from "@/components/AccountSyncStatus";
import { AdminMFA } from "@/components/AdminMFA";
import {
  authActions,
  authErrorMessage,
  normalizeEmail,
} from "@/services/authActions";
import { emailCodesReady } from "@/services/authClient";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { layout } from "@/theme/layout";

type Mode =
  | "signin"
  | "signup"
  | "verify"
  | "forgot"
  | "recovery-code"
  | "new-password"
  | "change-password"
  | "delete";
function Field({
  label,
  secret = false,
  ...props
}: TextInputProps & { label: string; secret?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          {...props}
          accessibilityLabel={label}
          placeholderTextColor={colors.subtle}
          style={styles.input}
          secureTextEntry={secret && !visible}
        />
        {secret && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              visible
                ? `Hide ${label.toLowerCase()}`
                : `Show ${label.toLowerCase()}`
            }
            onPress={() => setVisible((value) => !value)}
            style={styles.eye}
          >
            {visible ? (
              <EyeOff size={19} color={colors.muted} />
            ) : (
              <Eye size={19} color={colors.muted} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
function Button({
  title,
  onPress,
  busy = false,
  disabled = false,
  secondary = false,
  danger = false,
}: {
  title: string;
  onPress(): void;
  busy?: boolean;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        danger && styles.danger,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          color={secondary ? colors.green : colors.background}
        />
      ) : (
        <Text
          style={[
            styles.buttonText,
            secondary && styles.secondaryText,
            danger && styles.dangerText,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export default function AccountScreen() {
  const auth = useAuth(),
    data = useAccountData();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(""),
    [password, setPasswordInput] = useState("");
  const [newPassword, setNewPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [displayName, setDisplayName] = useState(""),
    [profileName, setProfileName] = useState("");
  const [code, setCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0),
    [clock, setClock] = useState(Date.now());
  const [confirmLogout, setConfirmLogout] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setProfileName(data.displayName);
  }, [data.displayName]);
  useEffect(() => {
    if (auth.recovery) setMode("new-password");
  }, [auth.recovery]);
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const cooldown = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const move = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
    setPasswordInput("");
    setNewPassword("");
    setConfirmation("");
    setCode("");
    setMfaCode("");
    setMfaRequired(false);
    setConfirmLogout(false);
  };
  const run = (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    void action()
      .catch((cause) => {
        if (alive.current) {
          setError(authErrorMessage(cause));
          if ((cause as { code?: string }).code === "mfa_required")
            setMfaRequired(true);
        }
      })
      .finally(() => {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      });
  };
  const sendCode = (recovery: boolean) =>
    run(async () => {
      const normalized = normalizeEmail(email);
      await authActions.sendCode(normalized, recovery);
      if (!alive.current) return;
      setEmail(normalized);
      setCode("");
      setMode(recovery ? "recovery-code" : "verify");
      setResendAt(Date.now() + 60_000);
      setClock(Date.now());
      setMessage(
        "If this email is eligible, a code will arrive shortly. Check your spam folder too.",
      );
    });
  const submitPassword = () =>
    run(async () => {
      if (newPassword !== confirmation) {
        setError("The new passwords do not match.");
        return;
      }
      if (mode === "change-password")
        await authActions.signIn(auth.session!.user.email!, password);
      await authActions.password(newPassword, mfaCode);
      if (!alive.current) return;
      auth.finishRecovery();
      move("signin");
      setMessage("Your password has been updated.");
    });
  const signOut = () =>
    run(async () => {
      await auth.signOut();
      await data.clearAccountCache();
      if (alive.current) {
        move("signin");
        setMessage(
          "You are signed out. Your synced favourites and preferences are saved to your account.",
        );
      }
    });
  const signedIn = !!auth.session;
  const mfaField = mfaRequired ? (
    <Field
      label="Authenticator code"
      value={mfaCode}
      onChangeText={(value) => setMfaCode(value.replace(/\D/g, "").slice(0, 6))}
      keyboardType="number-pad"
      maxLength={6}
      autoComplete="one-time-code"
      editable={!busy}
    />
  ) : null;
  const special =
    mode === "new-password" ||
    (signedIn && (mode === "change-password" || mode === "delete"));
  const title =
    signedIn && !special
      ? "Your account."
      : {
          signin: "Welcome back.",
          signup: "Make it yours.",
          verify: "Check your inbox.",
          forgot: "Forgot password?",
          "recovery-code": "Check your inbox.",
          "new-password": "A fresh start.",
          "change-password": "Change password.",
          delete: "Delete account?",
        }[mode];
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to AceRadio"
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace("/");
            }}
            style={styles.back}
          >
            <ChevronLeft color={colors.white} size={24} />
          </Pressable>
          <Text style={styles.headerText}>ACE RADIO ACCOUNT</Text>
          <View style={styles.back} />
        </View>
        <ScrollView
          testID="account-scroll"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Text style={typography.eyebrow}>
            {signedIn ? "YOUR SPACE" : "LISTEN. SAVE. CONNECT."}
          </Text>
          <Text
            style={[typography.pageTitle, styles.title]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          <Text style={styles.body}>
            {signedIn && !special
              ? "Your favourite shows and preferences, wherever you listen."
              : mode === "signup"
                ? "Create an account to keep your favourites and preferences across devices."
                : mode === "verify" || mode === "recovery-code"
                  ? `Enter the six-digit code sent to ${email}. It expires after 10 minutes.`
                  : mode === "delete"
                    ? "This permanently removes your account, profile, saved shows and preferences. This cannot be undone."
                    : mode === "new-password" || mode === "change-password"
                      ? "Use at least 10 characters with uppercase, lowercase and a number."
                      : "Radio is always free to listen to. Sign in to make it yours."}
          </Text>
          {auth.loading ? (
            <ActivityIndicator color={colors.green} style={styles.loader} />
          ) : !auth.available ? (
            <Text style={styles.error}>
              Accounts are currently unavailable. You can still listen and save
              shows on this device.
            </Text>
          ) : (
            <>
              {auth.error && (
                <View style={styles.notice}>
                  <Text style={styles.error}>{auth.error}</Text>
                  <Button
                    title="Reconnect account"
                    secondary
                    onPress={auth.retry}
                  />
                </View>
              )}
              {!signedIn && !emailCodesReady && (
                <View style={styles.notice}>
                  <Text style={styles.body}>
                    Account registration and email recovery are opening soon.
                    Verification emails are being set up. Existing accounts can
                    still sign in, and you can keep listening and saving shows
                    on this device.
                  </Text>
                </View>
              )}
              {signedIn && !special ? (
                <>
                  <AccountSyncStatus />
                  {data.role === "admin" && <AdminMFA />}
                  <View style={styles.identity}>
                    <ShieldCheck size={22} color={colors.green} />
                    <View style={styles.grow}>
                      <Text style={styles.identityName}>
                        {data.displayName}
                      </Text>
                      <Text style={styles.body}>
                        {auth.session!.user.email}
                      </Text>
                      <Text style={styles.small}>
                        {data.role === "admin"
                          ? "Studio admin"
                          : "Listener account"}
                      </Text>
                    </View>
                  </View>
                  <Field
                    label="Display name"
                    value={profileName}
                    onChangeText={setProfileName}
                    maxLength={40}
                    autoCapitalize="words"
                    editable={!busy && data.canEdit}
                  />
                  <Button
                    title="Save display name"
                    busy={busy}
                    disabled={
                      !data.canEdit ||
                      profileName.trim().length < 2 ||
                      profileName.trim() === data.displayName
                    }
                    onPress={() =>
                      run(async () => {
                        await data.updateName(profileName);
                        setMessage(
                          "Display name saved. It will sync with your account.",
                        );
                      })
                    }
                  />
                  {data.guestImportAvailable && (
                    <View style={styles.notice}>
                      <Text style={styles.body}>
                        {data.guestImportCount
                          ? `${data.guestImportCount} saved ${data.guestImportCount === 1 ? "show is" : "shows are"} on this device.`
                          : "A notification preference is saved on this device."}{" "}
                        Add these to your account without replacing existing
                        choices.
                      </Text>
                      <Button
                        title="Add device favourites & preferences"
                        secondary
                        disabled={!data.canEdit}
                        busy={busy}
                        onPress={() =>
                          run(async () => {
                            await data.importGuest();
                            setMessage(
                              "Device choices added. They are waiting to sync with your account.",
                            );
                          })
                        }
                      />
                    </View>
                  )}
                  <Button
                    title="Refresh saved account data"
                    secondary
                    disabled={!data.canEdit || data.syncing}
                    onPress={() => void data.refresh()}
                  />
                  <Button
                    title="Change password"
                    secondary
                    disabled={busy}
                    onPress={() => move("change-password")}
                  />
                  {confirmLogout ? (
                    <View style={styles.notice}>
                      <Text style={styles.body}>
                        You have changes waiting to sync. Signing out now
                        discards those unsynced changes from this device.
                      </Text>
                      <Button
                        title="Stay signed in"
                        secondary
                        onPress={() => setConfirmLogout(false)}
                      />
                      <Button
                        title="Discard pending changes & sign out"
                        danger
                        busy={busy}
                        onPress={signOut}
                      />
                    </View>
                  ) : (
                    <Button
                      title="Sign out"
                      secondary
                      disabled={busy}
                      onPress={() =>
                        data.pending ? setConfirmLogout(true) : signOut()
                      }
                    />
                  )}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => move("delete")}
                    disabled={busy}
                    style={styles.textAction}
                  >
                    <Text style={styles.dangerText}>Delete my account</Text>
                  </Pressable>
                </>
              ) : mode === "verify" || mode === "recovery-code" ? (
                <>
                  <Field
                    label="Verification code"
                    value={code}
                    onChangeText={(value) =>
                      setCode(value.replace(/\D/g, "").slice(0, 6))
                    }
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={6}
                    autoFocus
                    editable={!busy}
                  />
                  <Button
                    title="Verify code"
                    busy={busy}
                    disabled={code.length !== 6}
                    onPress={() =>
                      run(async () => {
                        const recovery = mode === "recovery-code";
                        await authActions.verify(email, code, recovery);
                        if (!alive.current) return;
                        setCode("");
                        setPasswordInput("");
                        setMode(recovery ? "new-password" : "signin");
                      })
                    }
                  />
                  <Button
                    title={cooldown ? `Resend in ${cooldown}s` : "Resend code"}
                    secondary
                    disabled={cooldown > 0}
                    busy={busy}
                    onPress={() => sendCode(mode === "recovery-code")}
                  />
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() =>
                      move(mode === "recovery-code" ? "forgot" : "signup")
                    }
                    style={styles.textAction}
                  >
                    <Text style={styles.link}>Use a different email</Text>
                  </Pressable>
                </>
              ) : mode === "new-password" || mode === "change-password" ? (
                <>
                  {mode === "change-password" && (
                    <Field
                      label="Current password"
                      secret
                      value={password}
                      onChangeText={(setPasswordInputValue) =>
                        setPasswordInput(setPasswordInputValue)
                      }
                      autoComplete="current-password"
                      autoCapitalize="none"
                      editable={!busy}
                    />
                  )}
                  <Field
                    label="New password"
                    secret
                    value={newPassword}
                    onChangeText={setNewPassword}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    editable={!busy}
                    maxLength={128}
                  />
                  <Field
                    label="Confirm new password"
                    secret
                    value={confirmation}
                    onChangeText={setConfirmation}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    editable={!busy}
                    maxLength={128}
                  />
                  {mfaField}
                  <Button
                    title="Update password"
                    busy={busy}
                    disabled={
                      !newPassword ||
                      !confirmation ||
                      (mode === "change-password" && !password)
                    }
                    onPress={submitPassword}
                  />
                  <Button
                    title="Cancel"
                    secondary
                    disabled={busy}
                    onPress={() => {
                      auth.finishRecovery();
                      move("signin");
                    }}
                  />
                </>
              ) : mode === "delete" ? (
                <>
                  <Field
                    label="Confirm your password"
                    secret
                    value={password}
                    onChangeText={(value) => setPasswordInput(value)}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    editable={!busy}
                  />
                  <Field
                    label="Type DELETE to confirm"
                    value={confirmation}
                    onChangeText={setConfirmation}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!busy}
                  />
                  {mfaField}
                  <Button
                    title="Permanently delete my account"
                    danger
                    busy={busy}
                    disabled={confirmation !== "DELETE" || !password}
                    onPress={() =>
                      run(async () => {
                        await authActions.deleteAccount(
                          auth.session!.user.email!,
                          password,
                          mfaCode,
                        );
                        await auth.signOut();
                        await data.clearAccountCache();
                        if (alive.current) {
                          move("signin");
                          setMessage(
                            "Your account and personal saved data have been deleted.",
                          );
                        }
                      })
                    }
                  />
                  <Button
                    title="Keep my account"
                    secondary
                    disabled={busy}
                    onPress={() => move("signin")}
                  />
                </>
              ) : (
                <>
                  {mode === "signup" && (
                    <Field
                      label="Display name"
                      value={displayName}
                      onChangeText={setDisplayName}
                      maxLength={40}
                      autoCapitalize="words"
                      editable={!busy}
                    />
                  )}
                  <Field
                    label="Email address"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoComplete="email"
                    textContentType="emailAddress"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!busy}
                    maxLength={254}
                  />
                  {mode !== "forgot" && (
                    <Field
                      label="Password"
                      secret
                      value={password}
                      onChangeText={(value) => setPasswordInput(value)}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      autoCapitalize="none"
                      editable={!busy}
                      maxLength={128}
                    />
                  )}
                  {mode === "signup" && (
                    <Text style={styles.small}>
                      At least 10 characters, including uppercase, lowercase and
                      a number.
                    </Text>
                  )}
                  <Button
                    title={
                      mode === "signup"
                        ? "Create account"
                        : mode === "forgot"
                          ? "Send reset code"
                          : "Sign in"
                    }
                    busy={busy}
                    disabled={
                      !email ||
                      (mode !== "forgot" && !password) ||
                      (mode === "signup" && displayName.trim().length < 2) ||
                      ((mode === "signup" || mode === "forgot") &&
                        !emailCodesReady)
                    }
                    onPress={() =>
                      mode === "forgot"
                        ? sendCode(true)
                        : run(async () => {
                            if (mode === "signup") {
                              const normalized = normalizeEmail(email);
                              await authActions.signUp(
                                normalized,
                                password,
                                displayName,
                              );
                              if (alive.current) {
                                setEmail(normalized);
                                setPasswordInput("");
                                setMode("verify");
                                setResendAt(Date.now() + 60_000);
                                setClock(Date.now());
                              }
                            } else {
                              await authActions.signIn(email, password);
                              if (alive.current) setPasswordInput("");
                            }
                          })
                    }
                  />
                  {mode === "signin" && (
                    <>
                      <Button
                        title="Create an account"
                        secondary
                        disabled={busy}
                        onPress={() => move("signup")}
                      />
                      <View style={styles.linkRow}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={() => move("forgot")}
                          style={styles.textAction}
                        >
                          <Text style={styles.link}>Forgot password?</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy || !email}
                          onPress={() => sendCode(false)}
                          style={styles.textAction}
                        >
                          <Text style={styles.link}>Verify email</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                  {mode !== "signin" && (
                    <Button
                      title="Back to sign in"
                      secondary
                      disabled={busy}
                      onPress={() => move("signin")}
                    />
                  )}
                </>
              )}
              {error && (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="assertive"
                  style={styles.error}
                >
                  {error}
                </Text>
              )}
              {message && (
                <Text accessibilityLiveRegion="polite" style={styles.success}>
                  {message}
                </Text>
              )}
            </>
          )}
          <Text style={styles.footer}>
            Your email stays private. You can keep listening without an account.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  content: {
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 14,
  },
  title: { marginTop: 2 },
  body: { ...typography.body },
  small: { ...typography.caption },
  field: { gap: 7 },
  label: { color: colors.white, fontSize: 13, fontWeight: "600" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.controlRadius,
    backgroundColor: colors.surface,
  },
  input: {
    color: colors.white,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    flex: 1,
    minWidth: 0,
  },
  eye: {
    width: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 50,
    borderRadius: layout.controlRadius,
    padding: 13,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    color: colors.background,
    textAlign: "center",
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.white },
  danger: {
    backgroundColor: "#371D1D",
    borderWidth: 1,
    borderColor: "#7B3E3E",
  },
  dangerText: { color: "#FFB6B6", fontSize: 13, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  link: {
    color: colors.green,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  textAction: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  error: { color: "#FFB6B6", fontSize: 13, lineHeight: 20 },
  success: { color: colors.green, fontSize: 13, lineHeight: 20 },
  loader: { marginVertical: 24 },
  notice: {
    padding: 14,
    borderRadius: layout.controlRadius,
    backgroundColor: colors.surface2,
    gap: 12,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  grow: { flex: 1 },
  identityName: { color: colors.white, fontSize: 20, fontWeight: "700" },
  footer: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: "center",
  },
});
