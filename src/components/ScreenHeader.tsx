import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { Heart, UserRound } from "lucide-react-native";
import { router } from "@/utils/navigation";
import { AceLogo } from "@/components/AceLogo";
import { useAuth } from "@/context/AuthContext";
import { useAccountData } from "@/context/AccountDataContext";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { layout } from "@/theme/layout";

function initialsFor(name: string) {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = Array.from(words[0] ?? "");
  const initials =
    words.length > 1
      ? (first[0] ?? "") + Array.from(words[words.length - 1])[0]
      : first.slice(0, 2).join("");
  return Array.from(initials.toUpperCase()).slice(0, 2).join("");
}

export function ScreenHeader() {
  const { session, loading } = useAuth();
  const { displayName } = useAccountData();
  const signedIn = !!session;
  const emailName = session?.user.email?.split("@")[0]?.split("+")[0] ?? "";
  // New accounts use the placeholder "Listener" until they choose a name.
  const name =
    displayName.trim().toLowerCase() === "listener" ? emailName : displayName;
  const initials = signedIn ? initialsFor(name) || initialsFor(emailName) : "";

  return (
    <View style={styles.root}>
      <Pressable
        testID="header-account"
        accessibilityRole="button"
        accessibilityLabel={
          loading
            ? "Open your account"
            : signedIn
              ? "Manage your account"
              : "Sign in or create an account"
        }
        accessibilityState={{ busy: loading }}
        aria-busy={loading}
        style={({ pressed }) => [
          styles.side,
          styles.profileTouch,
          pressed && styles.pressed,
        ]}
        onPress={() => router.push("/account")}
      >
        <View style={[styles.avatar, signedIn && styles.avatarSignedIn]}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : initials ? (
            <Text
              style={styles.initials}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {initials}
            </Text>
          ) : (
            <UserRound color={colors.muted} size={19} strokeWidth={1.8} />
          )}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="AceRadio home"
        style={({ pressed }) => [styles.brand, pressed && styles.pressed]}
        onPress={() => router.push("/")}
      >
        <AceLogo width={76} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="My favourites"
        style={({ pressed }) => [styles.side, pressed && styles.pressed]}
        onPress={() => router.push("/favorites")}
      >
        <Heart color={colors.muted} size={23} />
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  root: {
    height: 72,
    width: "100%",
    maxWidth: layout.contentWidth,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  side: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  profileTouch: { borderRadius: 22 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSignedIn: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.borderStrong,
  },
  initials: {
    color: colors.white,
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.4,
  },
  brand: {
    minHeight: 52,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  pressed: { backgroundColor: colors.surface2, opacity: 0.8 },
});
