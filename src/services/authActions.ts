import AsyncStorage from "@react-native-async-storage/async-storage";
import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import {
  accountConfig,
  accountFetch,
  getAuthClient,
} from "@/services/authClient";

export function authErrorMessage(error: unknown): string {
  const { code, status } = (error ?? {}) as { code?: string; status?: number };
  if (
    status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  )
    return "Too many attempts. Please wait a minute before trying again.";
  if (code === "invalid_credentials")
    return "The email or password is incorrect.";
  if (code === "email_not_confirmed")
    return "This account cannot sign in yet. Please contact AceRadio for help.";
  if (code === "user_already_exists" || code === "email_exists")
    return "An account with this email already exists. Please sign in instead.";
  if (code === "signup_disabled" || code === "email_provider_disabled")
    return "Account registration is currently unavailable. Please try again later.";
  if (code === "email_address_invalid") return "Enter a valid email address.";
  if (code === "weak_password")
    return "Choose a stronger password with at least 10 characters, including uppercase, lowercase and a number.";
  if (code === "same_password")
    return "Choose a different password from your current one.";
  if (code === "reauthentication_needed")
    return "Sign in again before changing your password.";
  if (error instanceof Error && error.name === "LocalAuthError")
    return error.message;
  return "Unable to complete that request. Check your connection and try again.";
}
function localError(message: string, code?: string): never {
  const error = new Error(message);
  error.name = "LocalAuthError";
  if (code) Object.assign(error, { code });
  throw error;
}
async function verifyEnrolledMFA(code?: string) {
  const { data: assurance, error: assuranceError } =
    await getAuthClient().auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance?.currentLevel === "aal2") return;
  const { data, error } = await getAuthClient().auth.mfa.listFactors();
  if (error) throw error;
  const factor = data.totp.find((item) => item.status === "verified");
  if (!factor) return;
  if (!code || !/^\d{6}$/.test(code))
    localError(
      "Enter the current code from your authenticator app.",
      "mfa_required",
    );
  const { error: verificationError } =
    await getAuthClient().auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
  if (verificationError)
    localError(
      "That authenticator code could not be verified. Try the current code.",
      "mfa_required",
    );
}
export function validPassword(password: string) {
  return (
    password.length >= 10 &&
    password.length <= 128 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}
export function normalizeEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    localError("Enter a valid email address.");
  return value;
}
const inFlight = new Set<string>();
async function run<T>(
  bucket: string,
  email: string,
  seconds: number,
  action: () => Promise<T>,
): Promise<T> {
  const hash = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    `${accountConfig.url}:${email}`,
  );
  const key = `aceradio:auth-cooldown:v1:${bucket}:${hash}`;
  if (inFlight.has(key))
    localError("Please wait for the current request to finish.");
  inFlight.add(key);
  try {
    const until = Number((await AsyncStorage.getItem(key)) ?? 0);
    const remaining = Math.min(seconds * 1000, until - Date.now());
    if (remaining > 0)
      localError(
        `Please wait ${Math.ceil(remaining / 1000)} seconds before trying again.`,
      );
    await AsyncStorage.setItem(key, String(Date.now() + seconds * 1000));
    return await action();
  } finally {
    inFlight.delete(key);
  }
}
export const authActions = {
  async signUp(email: string, password: string) {
    const normalized = normalizeEmail(email);
    if (!validPassword(password))
      localError(
        "Use at least 10 characters with uppercase, lowercase and a number.",
      );
    return run("signup", normalized, 3, async () => {
      const { data, error } = await getAuthClient().auth.signUp({
        email: normalized,
        password,
      });
      if (error) throw error;
      if (!data.session)
        localError(
          "Your account was created, but sign-in could not finish. Try signing in. If it still fails, please contact AceRadio.",
        );
      return data;
    });
  },
  async signIn(email: string, password: string) {
    const normalized = normalizeEmail(email);
    return run("login", normalized, 3, async () => {
      const { data, error } = await getAuthClient().auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (error) throw error;
      return data;
    });
  },
  async password(password: string, mfaCode?: string) {
    if (!validPassword(password))
      localError(
        "Use at least 10 characters with uppercase, lowercase and a number.",
      );
    await verifyEnrolledMFA(mfaCode);
    const { error } = await getAuthClient().auth.updateUser({ password });
    if (error) throw error;
  },
  async deleteAccount(email: string, password: string, mfaCode?: string) {
    const { user } = await authActions.signIn(email, password);
    await verifyEnrolledMFA(mfaCode);
    const {
      data: { session },
      error: sessionError,
    } = await getAuthClient().auth.getSession();
    if (sessionError) throw sessionError;
    if (
      !session ||
      !user ||
      user.email?.toLowerCase() !== email.trim().toLowerCase()
    )
      localError("Sign in again to confirm account deletion.");
    const response = await accountFetch(
      `${accountConfig.url}/functions/v1/account-delete`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: accountConfig.key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: true }),
      },
    );
    if (!response.ok) {
      if (response.status === 403)
        localError(
          "Deletion requires a recent password confirmation. Studio admins must transfer their role first.",
        );
      if (response.status === 429)
        localError("Too many attempts. Please try again later.");
      throw Error("Deletion failed.");
    }
  },
};
