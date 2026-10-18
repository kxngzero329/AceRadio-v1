import { fonts } from "@/theme/fonts";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Info, MessagesSquare, X } from "lucide-react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { openWhatsAppChat } from "@/services/links";
import { STATION } from "@/config/station";
import { colors } from "@/theme/colors";
import { layout } from "@/theme/layout";
import { typography } from "@/theme/typography";

export function ChatOptionsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [notice, setNotice] = useState<"development" | "link-error" | null>(
    null,
  );
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false);
  const openingRef = useRef(false);
  const closeButton = useRef<View>(null);

  useEffect(() => {
    if (visible) setNotice(null);
  }, [visible]);

  const openWhatsApp = async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setNotice(null);
    setOpeningWhatsApp(true);
    try {
      if (await openWhatsAppChat(STATION.whatsapp)) onClose();
      else setNotice("link-error");
    } finally {
      openingRef.current = false;
      setOpeningWhatsApp(false);
    }
  };

  return (
    <Modal
      testID="chat-options-modal"
      accessibilityLabel="Chat options"
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={() => {
        if (Platform.OS === "web") closeButton.current?.focus();
      }}
    >
      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
        ]}
      >
        <Pressable
          testID="chat-backdrop"
          accessible={false}
          focusable={false}
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onClose}
        />
        <View
          style={[
            styles.card,
            {
              maxHeight: Math.max(
                120,
                height - insets.top - insets.bottom - 40,
              ),
            },
          ]}
          accessibilityViewIsModal
        >
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.title}>
                Chat with us
              </Text>
              <Pressable
                ref={closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close chat options"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.close,
                  pressed && styles.pressed,
                ]}
              >
                <X size={21} color={colors.muted} />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              Choose how you’d like to reach the studio.
            </Text>
            <View style={[styles.options, fontScale > 1.35 && styles.stacked]}>
              {/* Informational activation explains the unavailable feature; it never starts a chat. */}
              <Pressable
                testID="chat-coming-soon"
                accessibilityRole="button"
                accessibilityLabel="In-app chat, coming soon"
                accessibilityHint="Shows a development notice. In-app chat is not available yet."
                accessibilityState={{ expanded: notice === "development" }}
                aria-expanded={notice === "development"}
                onPress={() => setNotice("development")}
                style={({ pressed }) => [
                  styles.option,
                  fontScale > 1.35 && styles.stackedOption,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.chatIcon}>
                  <MessagesSquare size={28} color={colors.muted} />
                </View>
                <Text style={[styles.optionTitle, styles.unavailableTitle]}>
                  Chat
                </Text>
                <Text style={styles.description}>In-app chat</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Coming soon</Text>
                </View>
              </Pressable>
              <Pressable
                testID="chat-whatsapp"
                accessibilityRole="button"
                accessibilityLabel="Open AceRadio on WhatsApp"
                accessibilityHint="Opens AceRadio’s WhatsApp chat."
                disabled={openingWhatsApp}
                accessibilityState={{
                  disabled: openingWhatsApp,
                  busy: openingWhatsApp,
                }}
                aria-busy={openingWhatsApp}
                onPress={() => void openWhatsApp()}
                style={({ pressed }) => [
                  styles.option,
                  fontScale > 1.35 && styles.stackedOption,
                  pressed && styles.pressed,
                  openingWhatsApp && styles.busy,
                ]}
              >
                <View style={styles.whatsappIcon}>
                  {openingWhatsApp ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <FontAwesome6
                      name="whatsapp"
                      size={30}
                      color={colors.accent}
                    />
                  )}
                </View>
                <Text style={styles.optionTitle}>WhatsApp</Text>
                <Text style={styles.description}>
                  {openingWhatsApp ? "Opening…" : "Message the studio"}
                </Text>
              </Pressable>
            </View>
            {notice && (
              <View
                testID={
                  notice === "development"
                    ? "chat-development-notice"
                    : "chat-link-error"
                }
                style={styles.notice}
              >
                <Info size={18} color={colors.muted} />
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={styles.noticeText}
                >
                  {notice === "development"
                    ? "In-app chat is not available yet. It’s currently in development."
                    : "Couldn’t open WhatsApp. Please try again."}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  backdrop: { backgroundColor: colors.overlay },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    overflow: "hidden",
  },
  content: { padding: 20 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  title: { ...typography.sectionTitle, fontSize: 22, lineHeight: 28, flex: 1 },
  close: {
    width: 44,
    height: 44,
    borderRadius: layout.controlRadius,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  subtitle: { ...typography.body, marginTop: 2, marginBottom: 20 },
  options: { flexDirection: "row", gap: 12 },
  stacked: { flexDirection: "column" },
  option: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 18,
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  stackedOption: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  chatIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  whatsappIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
  },
  optionTitle: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.semibold,
    textAlign: "center",
    marginTop: 12,
  },
  unavailableTitle: { color: colors.muted },
  description: { ...typography.caption, textAlign: "center", marginTop: 4 },
  badge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
  },
  badgeText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: fonts.semibold,
    textAlign: "center",
  },
  pressed: { backgroundColor: colors.border },
  busy: { opacity: 0.7 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    marginTop: 16,
    borderRadius: layout.controlRadius,
    backgroundColor: colors.background,
  },
  noticeText: { color: colors.muted, fontSize: 13, lineHeight: 20, flex: 1, fontFamily: fonts.regular },
});
