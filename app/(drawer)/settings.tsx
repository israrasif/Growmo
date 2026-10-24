import React, { useCallback, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import TopBar from "@/components/TopBar";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { Activity } from "@/types";
import {
  ACTIVITY_CATALOG,
  getActivities,
  saveActivities,
} from "@/utils/storage";
import { supabase } from "@/utils/supabase";
import { displayName, useUser } from "@/utils/useUser";
import {
  syncVaultPhotos,
  countUnsyncedPhotos,
  clearLocalVault,
} from "@/utils/vaultSync";
import SessionLengthCard from "@/components/SessionLengthCard";
import ReminderCard from "@/components/RemindersCard";
import { syncUserData, clearLocalUserData } from "@/utils/dataSync";
import { clearOnboarding } from "@/utils/onboardingStorage";

const MAX_LABEL = 30;

export default function SettingsScreen() {
  const user = useUser();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [draft, setDraft] = useState("");

  useFocusEffect(
    useCallback(() => {
      getActivities().then(setActivities);
    }, []),
  );

  const catalogIds = new Set(ACTIVITY_CATALOG.map((a) => a.id));
  const isCustom = (id: string) => !catalogIds.has(id);

  // Catalog first, then custom ones (anything saved that is not in the catalog).
  const options: Activity[] = [
    ...ACTIVITY_CATALOG,
    ...activities.filter((a) => isCustom(a.id)),
  ];
  const inList = (id: string) => activities.some((a) => a.id === id);

  const persist = async (next: Activity[]) => {
    setActivities(next);
    await saveActivities(next);
  };

  const removeFromList = async (item: Activity) => {
    if (activities.length === 1) {
      Alert.alert(
        "Keep at least one",
        "Your list needs at least one activity.",
      );
      return;
    }
    await persist(activities.filter((a) => a.id !== item.id));
  };

  const toggleInList = async (item: Activity) => {
    if (inList(item.id)) await removeFromList(item);
    else await persist([...activities, { ...item, enabled: false }]);
  };

  const confirmDeleteCustom = (item: Activity) => {
    Alert.alert(
      `Delete "${item.label}"?`,
      "It will be removed from your list. Past sessions keep their history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeFromList(item),
        },
      ],
    );
  };

  const addCustom = async () => {
    const label = draft.trim().replace(/\s+/g, " ");
    if (!label) return;
    const exists = options.some(
      (a) => a.label.toLowerCase() === label.toLowerCase() && inList(a.id),
    );
    if (exists) {
      Alert.alert("Already in your list", `"${label}" is already there.`);
      return;
    }
    // Typing the name of a catalog activity that is currently unticked just ticks it.
    const catalogMatch = ACTIVITY_CATALOG.find(
      (a) => a.label.toLowerCase() === label.toLowerCase(),
    );
    const item: Activity = catalogMatch
      ? { ...catalogMatch, enabled: false }
      : { id: `custom-${Date.now()}`, label, enabled: false };
    await persist([...activities, item]);
    setDraft("");
  };

  const finishSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Couldn't sign out", error.message);
      return;
    }
    await clearLocalVault();
    await clearLocalUserData();
  };

  const confirmSignOut = () => {
    Alert.alert(
      "Sign out?",
      "Your photos stay in your account and come back when you sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            const dataOk = await syncUserData();
            await syncVaultPhotos();
            const waiting = await countUnsyncedPhotos();
            if (waiting > 0 || !dataOk) {
              Alert.alert(
                "Some data isn't backed up",
                "Some of your data couldn't be uploaded (maybe you're offline). Signing out will delete it from this phone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign out anyway",
                    style: "destructive",
                    onPress: finishSignOut,
                  },
                ],
              );
              return;
            }
            await finishSignOut();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Settings</Text>
        <SessionLengthCard />
        <ReminderCard />
        <Text style={styles.sectionHeading}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.accountName}>{displayName(user)}</Text>
          {user?.email ? (
            <Text style={styles.accountEmail}>{user.email}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionHeading}>Your activities</Text>
        <Text style={styles.hint}>
          Choose which activities appear in {'"Today\'s focus"'} on the Home
          screen, or add your own.
        </Text>
        <View style={styles.card}>
          {options.map((a) => {
            const custom = isCustom(a.id);
            const selected = inList(a.id);
            return (
              <Pressable
                key={a.id}
                onPress={() =>
                  custom ? confirmDeleteCustom(a) : toggleInList(a)
                }
                style={styles.row}
                accessibilityRole={custom ? "button" : "checkbox"}
                accessibilityState={custom ? undefined : { checked: selected }}
                accessibilityLabel={custom ? `Delete ${a.label}` : undefined}
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{a.label}</Text>
                  {custom ? <Text style={styles.customTag}>Custom</Text> : null}
                </View>
                {custom ? (
                  <Ionicons
                    name="trash-outline"
                    size={22}
                    color={colors.danger}
                  />
                ) : (
                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={24}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                )}
              </Pressable>
            );
          })}

          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              placeholder="Add your own activity"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              maxLength={MAX_LABEL}
              returnKeyType="done"
              onSubmitEditing={addCustom}
            />
            <Pressable
              style={[styles.addBtn, !draft.trim() && styles.addBtnDisabled]}
              onPress={addCustom}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add activity"
            >
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* TODO: reminders, notifications, manage subscription, Terms and Privacy links. */}

        <Pressable
          style={styles.signOut}
          onPress={confirmSignOut}
          accessibilityRole="button"
        >
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        {__DEV__ && (
          <Pressable onPress={clearOnboarding} style={{ padding: 16 }}>
            <Text>Dev: restart onboarding</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { ...typography.h1, color: colors.text },
  sectionHeading: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  accountName: { ...typography.h3, color: colors.text, marginTop: spacing.md },
  accountEmail: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
  customTag: {
    ...typography.caption,
    color: colors.primaryDark,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: "hidden",
    fontWeight: "700",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDisabled: { opacity: 0.4 },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  signOutText: { color: colors.danger, fontWeight: "700", fontSize: 16 },
});
