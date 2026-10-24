// components/BaselinePhotoCard.tsx  (sits on the Home screen, under the guide card)
// Nudges Plus members who have not done an AI hair check yet (for example they skipped it in onboarding).
// Shows nothing for Free users, and nothing once there is at least one scan.
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { hasPlus, usePlan } from "@/utils/entitlements";
import { fetchScans } from "@/utils/analyzeHair";

const SNOOZE_KEY = "@hair_massage/baseline_snooze_until";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // "Not now" hides the card for three days

export default function BaselinePhotoCard() {
  const router = useRouter();
  const plus = hasPlus(usePlan());
  const [show, setShow] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!plus) {
          if (active) setShow(false);
          return;
        }
        try {
          const [scans, snoozed] = await Promise.all([fetchScans(), AsyncStorage.getItem(SNOOZE_KEY)]);
          const snoozeUntil = Number(snoozed) || 0;
          if (active) setShow(scans.length === 0 && Date.now() > snoozeUntil);
        } catch {
          // Offline or a temporary error: better to show nothing than to nag.
          if (active) setShow(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [plus]),
  );

  if (!show) return null;

  const snooze = async () => {
    setShow(false);
    await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS)).catch(() => {});
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="camera-outline" size={22} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Take your baseline photo</Text>
          <Text style={styles.sub}>
            Your first AI hair check shows where you are starting from, so you can see how your hair changes over
            time. Use good light and keep the spot and angle the same each time.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={() => router.navigate("/analyze" as any)} accessibilityRole="button">
          <Text style={styles.buttonText}>Take photo</Text>
        </Pressable>
        <Pressable onPress={snooze} hitSlop={8} accessibilityRole="button">
          <Text style={styles.later}>Not now</Text>
        </Pressable>
      </View>
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
    marginTop: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { ...typography.h3, color: colors.text },
  sub: { ...typography.caption, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.md },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { ...typography.body, color: "#fff", fontWeight: "600" },
  later: { ...typography.body, color: colors.textMuted, fontWeight: "600" },
});