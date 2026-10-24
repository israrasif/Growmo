// app/(drawer)/(tabs)/index.tsx
import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import CircularTimer from "@/components/CircularTimer";
import ToggleList from "@/components/ToggleList";
import DailyCheckIn from "@/components/DailyCheckIn";
import GuideCard from "@/components/GuideCard";
import { useSessionGuide } from "@/utils/useSessionGuide";
import { Activity, Session } from "@/types";
import { getActivities, saveActivities, addSession } from "@/utils/storage";
import { DEFAULT_SESSION_MIN, getSessionLengthMin } from "@/utils/settings";
import { rescheduleReminders } from "@/utils/reminders";
import { colors, spacing, typography } from "@/constants/theme";
import { toLocalDateISO } from "@/utils/date";
import TopBar from "@/components/TopBar";
import { contentColumn } from "@/utils/responsive";
import BaselinePhotoCard from "@/components/BaselinePhotoCard";

export default function HomeScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  // Timer length comes from Settings (1-60 minutes, default 5)
  const [durationSec, setDurationSec] = useState(DEFAULT_SESSION_MIN * 60);
  // Guided sessions: the timer moves you through the areas of your scalp, using your plan
  const guide = useSessionGuide(durationSec);

  // Reload on focus so edits made in Settings show up (this screen stays mounted in the drawer).
  useFocusEffect(
    useCallback(() => {
      getActivities().then(setActivities);
      getSessionLengthMin().then((m) => setDurationSec(m * 60));
      // Refresh the next 7 days of reminders (skips today if you've already massaged)
      rescheduleReminders();
    }, []),
  );

  const handleToggle = useCallback(
    async (id: string) => {
      const updated = activities.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled } : a,
      );
      setActivities(updated);
      await saveActivities(updated);
    },
    [activities],
  );

  const handleComplete = useCallback(
    async (elapsedSec: number) => {
      const now = new Date();
      const session: Session = {
        id: `${now.getTime()}`,
        dateISO: toLocalDateISO(now),
        timestamp: now.getTime(),
        durationSec: elapsedSec,
        activities: activities.filter((a) => a.enabled).map((a) => a.label),
      };
      await addSession(session);
      // Done for today: drop today's reminder and keep the next days
      rescheduleReminders();
      Alert.alert(
        "Session logged 🎉",
        "Nice work — this session was added to your tracker.",
      );
    },
    [activities],
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Daily Hair Massage</Text>
        <Text style={styles.subtitle}>
          Follow along, then relax while the timer runs.
        </Text>

        <View style={styles.timerWrap}>
          {/* key makes the timer restart cleanly when the length changes in Settings */}
          <CircularTimer
            key={durationSec}
            durationSec={durationSec}
            onComplete={handleComplete}
            segments={guide.segments}
            voiceCues={guide.voiceOn}
          />
        </View>

        <GuideCard guide={guide} />

        <BaselinePhotoCard />

        <ToggleList activities={activities} onToggle={handleToggle} />

        <DailyCheckIn />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2, ...contentColumn },
  title: { ...typography.h1, color: colors.text },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  timerWrap: { alignItems: "center", marginTop: spacing.xl },
});