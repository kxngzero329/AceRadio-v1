import { fonts } from "@/theme/fonts";
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
  useWindowDimensions,
  View,
  type TextInputProps,
} from "react-native";
import { ScreenSafeArea } from "@/components/ScreenSafeArea";
import { ChevronLeft, Eye, EyeOff, ShieldCheck } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAccountData } from "@/context/AccountDataContext";
import { AccountSyncStatus } from "@/components/AccountSyncStatus";
import { AceLogo } from "@/components/AceLogo";
import { AdminMFA } from "@/components/AdminMFA";
import {
  authActions,
  authErrorMessage,
  normalizeEmail,
} from "@/services/authActions";
import { colors } from "@/theme/colors";
import { typography } from "@/theme/typography";
import { layout } from "@/theme/layout";

type Mode = "signin" | "signup" | "change-password" | "delete";
function Field({
  label,
  secret = false,
  inputRef,
  ...props
}: TextInputProps & {
  label: string;
  secret?: boolean;
  inputRef?: React.Ref<TextInput>;
}) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused && styles.inputFocused,
          props.editable === false && styles.inputDisabled,
        ]}
      >
        <TextInput
          {...props}
          ref={inputRef}
          accessibilityLabel={label}
          placeholderTextColor={colors.subtle}
          selectionColor={colors.selection}
          cursorColor={colors.accent}
          style={styles.input}
          secureTextEntry={secret && !visible}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
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
            disabled={props.editable === false}
            accessibilityState={{ disabled: props.editable === false }}
            style={({ pressed }) => [styles.eye, pressed && styles.pressed]}
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
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      aria-busy={busy}
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
          color={secondary || danger ? colors.accent : colors.onAccent}
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
  const { width } = useWindowDimensions();
  const auth = useAuth(),
    data = useAccountData();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState(""),
    [password, setPasswordInput] = useState("");
  const [newPassword, setNewPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [profileName, setProfileName] = useState("");
  const passwordRef = useRef<TextInput>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null);
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
  const move = (next: Mode) => {
    setMode(next);
    setError(null);
    setMessage(null);
    setPasswordInput("");
    setNewPassword("");
    setConfirmation("");
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
  const submitAuth = () => {
    if (
      !email.trim() ||
      !password ||
      busyRef.current ||
      auth.loading ||
      !auth.available ||
      auth.error
    )
      return;
    run(async () => {
      const normalized = normalizeEmail(email);
      if (mode === "signup") await authActions.signUp(normalized, password);
      else await authActions.signIn(normalized, password);
      if (alive.current) {
        setEmail(normalized);
        setPasswordInput("");
        setMode("signin");
      }
    });
  };
  const submitPassword = () =>
    run(async () => {
      if (newPassword !== confirmation) {
        setError("The new passwords do not match.");
        return;
      }
      await authActions.signIn(auth.session!.user.email!, password);
      await authActions.password(newPassword, mfaCode);
      if (!alive.current) return;
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
  const special = signedIn && (mode === "change-password" || mode === "delete");
  const title =
    signedIn && !special
      ? "Your account."
      : {
          signin: "Welcome back.",
          signup: "Make it yours.",
          "change-password": "Change password.",
          delete: "Delete account?",
        }[mode];
  return (
    <ScreenSafeArea style={styles.screen}>
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
            style={({ pressed }) => [
              styles.back,
              pressed && styles.backPressed,
            ]}
          >
            <ChevronLeft color={colors.white} size={24} />
          </Pressable>
          <AceLogo width={76} />
          <View style={styles.back} />
        </View>
        <ScrollView
          testID="account-scroll"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            width < 360 && styles.contentCompact,
          ]}
        >
          <View style={styles.heading}>
            <Text style={typography.eyebrow}>
              {signedIn ? "YOUR SPACE" : "YOUR ACE RADIO ACCOUNT"}
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
                  ? "Your favourite shows, saved wherever you listen."
                  : mode === "delete"
                    ? "This permanently removes your account, profile, saved shows and preferences. This cannot be undone."
                    : mode === "change-password"
                      ? "Use at least 10 characters with uppercase, lowercase and a number."
                      : "Sign in to keep your favourite shows and preferences in sync."}
            </Text>
          </View>
          {auth.loading ? (
            <ActivityIndicator color={colors.accent} style={styles.loader} />
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
              {signedIn && !special ? (
                <>
                  <AccountSyncStatus />
                  {data.role === "admin" && <AdminMFA />}
                  <View style={styles.identity}>
                    <ShieldCheck size={22} color={colors.accent} />
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
              ) : mode === "change-password" ? (
                <>
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
                    disabled={!newPassword || !confirmation || !password}
                    onPress={submitPassword}
                  />
                  <Button
                    title="Cancel"
                    secondary
                    disabled={busy}
                    onPress={() => {
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
                  <View
                    testID="account-auth-form"
                    style={[
                      styles.authForm,
                      width < 360 && styles.authFormCompact,
                    ]}
                  >
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
                      placeholder="you@example.com"
                      returnKeyType="next"
                      submitBehavior="submit"
                      onSubmitEditing={() => passwordRef.current?.focus()}
                    />
                    <Field
                      key={mode}
                      inputRef={passwordRef}
                      label="Password"
                      secret
                      placeholder={
                        mode === "signup"
                          ? "Choose a password"
                          : "Enter your password"
                      }
                      value={password}
                      onChangeText={(value) => setPasswordInput(value)}
                      autoComplete={
                        mode === "signup" ? "new-password" : "current-password"
                      }
                      autoCapitalize="none"
                      editable={!busy}
                      maxLength={128}
                      autoCorrect={false}
                      textContentType={
                        mode === "signup" ? "newPassword" : "password"
                      }
                      returnKeyType="go"
                      submitBehavior="submit"
                      onSubmitEditing={submitAuth}
                    />
                    {mode === "signup" && (
                      <Text style={styles.small}>
                        At least 10 characters, including uppercase, lowercase
                        and a number.
                      </Text>
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
                    <Button
                      title={mode === "signup" ? "Create account" : "Sign in"}
                      busy={busy}
                      disabled={!email.trim() || !password || !!auth.error}
                      onPress={submitAuth}
                    />
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={styles.small}>
                      {mode === "signin"
                        ? "New to AceRadio?"
                        : "Already have an account?"}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        mode === "signin"
                          ? "Create an account"
                          : "Back to sign in"
                      }
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={() =>
                        move(mode === "signin" ? "signup" : "signin")
                      }
                      style={({ pressed }) => [
                        styles.switchAction,
                        pressed && styles.backPressed,
                        busy && styles.disabled,
                      ]}
                    >
                      <Text style={styles.switchText}>
                        {mode === "signin" ? "Create an account" : "Sign in"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
              {error && signedIn && (
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
    </ScreenSafeArea>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  backPressed: { backgroundColor: colors.surface2, opacity: 0.8 },
  content: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: layout.gutter,
    paddingTop: 26,
    paddingBottom: 32,
    gap: 20,
  },
  contentCompact: { paddingHorizontal: 16, paddingTop: 16 },
  heading: { gap: 8, marginBottom: 4 },
  title: { marginTop: 0 },
  authForm: {
    padding: 20,
    gap: 18,
    borderRadius: layout.cardRadius,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  authFormCompact: { padding: 16 },
  switchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: 4,
  },
  switchAction: {
    minHeight: 44,
    paddingHorizontal: 6,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: "center",
  },
  switchText: {
    ...typography.caption,
    color: colors.white,
    fontFamily: fonts.semibold,
  },
  body: { ...typography.body },
  small: { ...typography.caption },
  field: { gap: 7 },
  label: { color: colors.white, fontSize: 13, fontFamily: fonts.semibold },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: layout.controlRadius,
    backgroundColor: colors.background,
  },
  inputFocused: { borderColor: colors.muted },
  inputDisabled: { opacity: 0.65 },
  input: {
    color: colors.white,
    outlineColor: colors.accent,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    flex: 1,
    minWidth: 0,
    fontFamily: fonts.regular,
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
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.semibold,
    color: colors.onAccent,
    textAlign: "center",
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.white },
  danger: {
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  dangerText: { color: colors.error, fontSize: 13, fontFamily: fonts.semibold },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  textAction: {
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  error: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
    backgroundColor: colors.errorSurface,
    borderLeftWidth: 2,
    borderColor: colors.errorBorder,
    borderRadius: 8,
    fontFamily: fonts.regular,
  },
  success: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
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
  identityName: {
    color: colors.white,
    fontSize: 20,
    fontFamily: fonts.displayBold,
  },
  footer: {
    color: colors.subtle,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 0,
    paddingHorizontal: 8,
    textAlign: "center",
    fontFamily: fonts.medium,
  },
});
