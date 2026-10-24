// components/AccountCard.tsx  (add near the bottom of the Settings screen)
// Manage subscription (Plus members) and permanent account deletion.
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { supabase } from "@/utils/supabase";
import { hasPlus, usePlan } from "@/utils/entitlements";
import { clearLocalVault } from "@/utils/vaultSync";
import { clearLocalUserData } from "@/utils/dataSync";
import {
  clearOnboarding,
  deleteOnboardingPhoto,
  saveOnboarding,
} from "@/utils/onboardingStorage";
import { identifyPurchaser } from "@/utils/purchases";

const STORE_NAME = Platform.OS === "ios" ? "the App Store" : "Google Play";
const MANAGE_URL =
  Platform.OS === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : "https://play.google.com/store/account/subscriptions";
const CONFIRM_WORD = "DELETE";

export default function AccountCard() {
  const plus = hasPlus(usePlan());
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const deleteAccount = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) {
      setBusy(false);
      Alert.alert(
        "Could not delete your account",
        "Nothing was lost. Check your connection and try again.",
      );
      return;
    }
    // The account is gone on the server. Clear everything on this phone and sign out.
    try {
      await identifyPurchaser(null);
      await clearLocalVault();
      await clearLocalUserData();
      await clearOnboarding();
    } finally {
      await supabase.auth.signOut({ scope: "local" }); // the app switches to the login screen by itself
    }
  };

  // Development builds only: start onboarding again from the first question (the app switches to it at once)
  const restartOnboarding = async () => {
    await deleteOnboardingPhoto();
    // One single write, so the onboarding screens already see the flag when they open
    await saveOnboarding({
      finished: false,
      answers: {},
      stepIndex: 0,
      completedAt: undefined,
      answersSynced: false,
      photoUri: undefined,
      photoStepDone: false,
      devFullFlow: true,
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Account</Text>

      {__DEV__ && (
        <Pressable
          style={styles.row}
          onPress={restartOnboarding}
          accessibilityRole="button"
        >
          <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
          <Text style={styles.rowText}>Dev: restart onboarding</Text>
        </Pressable>
      )}

      {plus && (
        <Pressable
          style={styles.row}
          onPress={() => Linking.openURL(MANAGE_URL).catch(() => {})}
          accessibilityRole="link"
        >
          <Ionicons name="card-outline" size={20} color={colors.primary} />
          <Text style={styles.rowText}>Manage subscription</Text>
          <Ionicons name="open-outline" size={18} color={colors.textMuted} />
        </Pressable>
      )}

      {!open ? (
        <Pressable
          style={styles.row}
          onPress={() => setOpen(true)}
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
          <Text style={[styles.rowText, { color: colors.danger }]}>
            Delete account
          </Text>
        </Pressable>
      ) : (
        <View style={styles.confirm}>
          <Text style={styles.warnTitle}>Delete your account?</Text>
          <Text style={styles.warnText}>
            This permanently deletes your login, photos, hair checks, sessions,
            plan and settings. It cannot be undone.
          </Text>
          {plus && (
            <Text style={styles.warnText}>
              Deleting your account does not cancel your Plus subscription.
              Cancel it in {STORE_NAME} first, or you will keep being charged.
            </Text>
          )}
          <Text style={styles.warnText}>Type {CONFIRM_WORD} to confirm.</Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`}
          />
          <View style={styles.buttons}>
            <Pressable
              onPress={deleteAccount}
              disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD}
              style={[
                styles.deleteBtn,
                (busy || typed.trim().toUpperCase() !== CONFIRM_WORD) && {
                  opacity: 0.4,
                },
              ]}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.deleteText}>Delete everything</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setOpen(false);
                setTyped("");
              }}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.xl,
  },
  title: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
  },
  rowText: { ...typography.body, color: colors.text, flex: 1 },
  confirm: { marginTop: spacing.sm },
  warnTitle: { ...typography.h3, color: colors.danger },
  warnText: {
    ...typography.body,
    fontSize: 14,
    color: colors.text,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.sm,
    color: colors.text,
    ...typography.body,
  },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  deleteBtn: {
    backgroundColor: colors.danger,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    minWidth: 160,
    alignItems: "center",
  },
  deleteText: { ...typography.body, color: "#fff", fontWeight: "700" },
  cancel: { ...typography.body, color: colors.textMuted, fontWeight: "600" },
});
