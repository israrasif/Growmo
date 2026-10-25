// components/GuideCard.tsx  (sits under the timer on the Home screen)
// Guided sessions are a Plus feature. Free users see nothing here and just use the plain timer.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/constants/theme";
import type { SessionGuide } from "@/utils/useSessionGuide";

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

const NOTICE_KEY = "@hair_massage/first_session_notice_seen";

export default function GuideCard({ guide }: { guide: SessionGuide }) {
  const router = useRouter();
  // Shown once, before the first guided session. null = not read yet.
  const [noticeSeen, setNoticeSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(NOTICE_KEY).then((v) => setNoticeSeen(v === "1"));
  }, []);
  const dismissNotice = () => {
    setNoticeSeen(true);
    AsyncStorage.setItem(NOTICE_KEY, "1");
  };

  // Free plan: no plan, no guidance, nothing to show
  if (!guide.isPlus) return null;

  // Plus, but no plan yet: invite them to build one
  if (!guide.plan) {
    return (
      <Pressable
        style={styles.card}
        onPress={() => router.navigate("/routine")}
        accessibilityRole="button"
      >
        <View style={styles.row}>
          <Ionicons
            name="navigate-circle-outline"
            size={22}
            color={colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Want a guided session?</Text>
            <Text style={styles.sub}>
              Build your plan and the timer will guide you step by step, one
              area of your scalp at a time.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Pressable>
    );
  }

  // A plan saved before the three-area program
  if (guide.outdated || !guide.week || !guide.focus) {
    return (
      <Pressable
        style={styles.card}
        onPress={() => router.navigate("/routine")}
        accessibilityRole="button"
      >
        <View style={styles.row}>
          <Ionicons
            name="refresh-circle-outline"
            size={22}
            color={colors.primary}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Update your plan</Text>
            <Text style={styles.sub}>
              We have a new session routine. Rebuild your plan to use it.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      </Pressable>
    );
  }

  const { plan, week, focus } = guide;

  return (
    <View style={styles.card}>
      {noticeSeen === false && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Before your first session</Text>
          <Text style={styles.noticeLine}>
            • Plant your fingers and let the scalp move under them. Don't drag
            them across the skin.
          </Text>
          <Text style={styles.noticeLine}>• Keep your nails short.</Text>
          <Text style={styles.noticeLine}>
            • A few loose hairs may come out, and mild pinkness afterwards is
            normal. If your hair looks visibly thinner, lighten your pressure or
            skip pressing for a while.
          </Text>
          <Text style={styles.noticeLine}>
            • Stop if you feel pain, burning or irritation.
          </Text>
          <Pressable
            onPress={dismissNotice}
            style={styles.noticeBtn}
            accessibilityRole="button"
          >
            <Text style={styles.noticeBtnText}>Got it</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.title}>
        Guided session: {plan.program.zoneLabels[focus]}
      </Text>
      <Text style={styles.sub}>
        Week {guide.weekNumber}. {week.techniques[0]}.
      </Text>
      <Text style={styles.sub}>{plan.program.rotationNote}</Text>
      {week.pressNote ? <Text style={styles.sub}>{week.pressNote}</Text> : null}
      {guide.sessionsToday >= week.sessionsPerDay ? (
        <Text style={styles.sub}>
          You have finished today's sessions. Your scalp needs rest between
          sessions, so extra ones today will not speed things up.
        </Text>
      ) : null}

      {guide.preview.map((s, i) => (
        <View key={s.id} style={styles.segBlock}>
          <View style={styles.segRow}>
            <Text style={styles.segNum}>{i + 1}</Text>
            <Text style={styles.segLabel}>{s.label}</Text>
            <Text style={styles.segTime}>{mmss(s.seconds)}</Text>
          </View>
          <Text style={styles.segText}>{s.text}</Text>
        </View>
      ))}
      <Text style={styles.pressure}>{plan.pressureRule}</Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Guide me step by step</Text>
        <Switch
          value={guide.guideOn}
          onValueChange={guide.setGuideOn}
          trackColor={{ true: colors.primary, false: colors.track }}
        />
      </View>
      <View style={styles.switchRow}>
        <Text
          style={[
            styles.switchLabel,
            !guide.guideOn && { color: colors.textMuted },
          ]}
        >
          Voice cues (vibration always on)
        </Text>
        <Switch
          value={guide.voiceOn}
          onValueChange={guide.setVoiceOn}
          disabled={!guide.guideOn}
          trackColor={{ true: colors.primary, false: colors.track }}
        />
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
    marginTop: spacing.xl,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.h3, color: colors.text },
  sub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  notice: {
    backgroundColor: colors.track,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeTitle: { ...typography.h3, color: colors.text },
  noticeLine: {
    ...typography.caption,
    color: colors.text,
    marginTop: 4,
    lineHeight: 18,
  },
  noticeBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  noticeBtnText: { ...typography.body, color: "#fff", fontWeight: "600" },
  segBlock: { paddingVertical: 6 },
  segRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  segNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    backgroundColor: colors.track,
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: 12,
    overflow: "hidden",
  },
  segLabel: { ...typography.body, color: colors.text, flex: 1 },
  segTime: { ...typography.body, color: colors.textMuted },
  segText: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: 22 + spacing.sm,
    marginTop: 2,
    lineHeight: 18,
  },
  pressure: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  switchLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    paddingRight: spacing.sm,
  },
});
