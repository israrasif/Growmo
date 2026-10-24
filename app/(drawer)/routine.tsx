// app/(drawer)/routine.tsx
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import TopBar from "@/components/TopBar";
import PlanIntake from "@/components/PlanIntake";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { hasPlus, usePlan } from "@/utils/entitlements";
import { getSessions } from "@/utils/storage";
import { buildGuide } from "@/utils/sessionGuide";
import { setSessionLengthMin } from "@/utils/settings";
import {
  Plan,
  PlanIntake as Intake,
  WeekPlan,
  applyReview,
  buildPlan,
  currentWeek,
  daysDoneInWeek,
  maxAdjustableDays,
  resetWeeklyDays,
  reviewPlan,
  setWeeklyDays,
} from "@/utils/planBuilder";
import {
  PlanProgress,
  getPlan,
  getPlanConfig,
  getProgress,
  getQuizInput,
  getScanInput,
  resetPlan,
  savePlan,
  saveProgress,
} from "@/utils/planStore";

const EMPTY: PlanProgress = { done: {}, shedding: {}, irritation: false };

const describe = (w: WeekPlan) =>
  `${w.sessionsPerDay} ${w.sessionsPerDay === 1 ? "session" : "sessions"} of ${w.minutesPerSession} min, ${w.daysPerWeek} days a week`;

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

export default function RoutineScreen() {
  const router = useRouter();
  const plus = hasPlus(usePlan());

  const [config, setConfig] = useState<any>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<PlanProgress>(EMPTY);
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [hasQuiz, setHasQuiz] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [gate, setGate] = useState<{ title: string; body: string } | null>(
    null,
  );
  const [showAll, setShowAll] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [cfg, p, prog, sessions, quiz] = await Promise.all([
          getPlanConfig(),
          getPlan(),
          getProgress(),
          getSessions(),
          getQuizInput(),
        ]);
        if (!active) return;
        setConfig(cfg);
        setPlan(p);
        setProgress(prog);
        setTimestamps(sessions.map((s) => s.timestamp));
        setHasQuiz(!!quiz);
        setLoaded(true);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const updateProgress = async (next: PlanProgress) => {
    setProgress(next);
    await saveProgress(next);
  };

  const onIntakeDone = async (intake: Intake) => {
    setIntakeOpen(false);
    setBuilding(true);
    setGate(null);
    try {
      const cfg = config ?? (await getPlanConfig());
      const quiz = await getQuizInput();
      if (!quiz) return;
      const scan = await getScanInput();
      const result = buildPlan(cfg, quiz, scan, intake);
      if (result.kind === "doctor_first") {
        setGate({ title: result.title, body: result.body });
      } else {
        await savePlan(result.plan);
        await saveProgress(EMPTY);
        setPlan(result.plan);
        setProgress(EMPTY);
      }
    } finally {
      setBuilding(false);
    }
  };

  const confirmReset = () =>
    Alert.alert(
      "Start over?",
      "This removes your current plan and its progress. Your photos and scores stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove plan",
          style: "destructive",
          onPress: async () => {
            await resetPlan();
            setPlan(null);
            setProgress(EMPTY);
            setGate(null);
          },
        },
      ],
    );

  if (!loaded) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <TopBar />
        <ActivityIndicator
          style={{ marginTop: spacing.xl }}
          color={colors.primary}
        />
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------- Free plan
  // The personalized routine is part of Plus. Free users just use the timer, with no plan or guidance.
  if (!plus) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <TopBar />
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Your routine</Text>
          <View style={[styles.card, styles.lockCard]}>
            <View style={styles.rowCenter}>
              <Ionicons
                name="lock-closed"
                size={18}
                color={colors.primaryDark}
              />
              <Text style={styles.cardTitle}>Part of Plus</Text>
            </View>
            <Text style={styles.body}>
              A 12-week routine built around you: three scalp areas in rotation,
              guided sessions on the timer, and monthly reviews that adjust to
              how you're doing.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push("/plans")}
            >
              <Text style={styles.primaryBtnText}>See Plus</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------------- no plan yet
  if (!plan) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <TopBar />
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Your routine</Text>
          <Text style={styles.subtitle}>
            A 12-week scalp-care plan built from your hair health check and
            photo scans.
          </Text>

          {gate && (
            <View style={[styles.card, styles.gateCard]}>
              <Text style={styles.cardTitle}>{gate.title}</Text>
              <Text style={styles.body}>{gate.body}</Text>
            </View>
          )}

          {building ? (
            <ActivityIndicator
              style={{ marginTop: spacing.lg }}
              color={colors.primary}
            />
          ) : !hasQuiz ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                First, take the hair health check
              </Text>
              <Text style={styles.body}>
                Your plan is built from your answers. It takes about 2 minutes
                and is free.
              </Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => router.navigate("/analyze" as any)}
              >
                <Text style={styles.primaryBtnText}>
                  Go to the hair health check
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Build my plan</Text>
              <Text style={styles.body}>
                Four quick questions, then you'll see your plan.
              </Text>
              <Pressable
                style={styles.primaryBtn}
                onPress={() => setIntakeOpen(true)}
              >
                <Text style={styles.primaryBtnText}>Start (4 questions)</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.disclaimer}>
            A habit plan for scalp care, not medical advice and not a treatment
            for hair loss.
          </Text>
        </ScrollView>
        <PlanIntake
          visible={intakeOpen}
          onClose={() => setIntakeOpen(false)}
          onDone={onIntakeDone}
        />
      </SafeAreaView>
    );
  }

  // ------------------------------------------------------- plan from an older version
  // Plans saved before the three-area program are missing its fields (program, minutesPerSession, press).
  // Showing them would crash or print "undefined", so ask the person to rebuild instead.
  const outdated =
    !plan.program ||
    plan.weeks.some((w) => w.minutesPerSession == null || w.press == null);
  if (outdated) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <TopBar />
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>Your routine</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Update your plan</Text>
            <Text style={styles.body}>
              We have a new session routine: three scalp areas in rotation, with
              a warm-up, pinching, pressing and stretching. Your old plan needs
              to be rebuilt to use it. Your photos and scores stay.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={async () => {
                await resetPlan();
                setPlan(null);
                setProgress(EMPTY);
                setGate(null);
              }}
            >
              <Text style={styles.primaryBtnText}>Rebuild my plan</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------------------------------------------------------------- has plan
  const cw = currentWeek(plan);
  const week = plan.weeks[cw - 1];
  const daysDone = daysDoneInWeek(plan, cw, timestamps);

  const review = config
    ? reviewPlan(
        config,
        plan,
        timestamps,
        progress.shedding,
        progress.irritation,
      )
    : null;
  const showReview =
    !!review && plus && cw >= 2 && (progress.reviewedWeek ?? 0) < cw;

  const applyReviewNow = async () => {
    if (!review || !config) return;
    const next = applyReview(config, plan, review.action, cw);
    await savePlan(next);
    setPlan(next);
    await updateProgress({ ...progress, irritation: false, reviewedWeek: cw });
  };

  // Days per week: the person can change this at any time, from this week onwards
  const minDays = config?.adjust?.minDays ?? 2;
  const maxDays = config ? maxAdjustableDays(config, plan) : 7;
  const recDays = week.recommendedDays ?? week.daysPerWeek;

  const changeDays = async (delta: number) => {
    if (!config) return;
    const next = setWeeklyDays(config, plan, week.daysPerWeek + delta, cw);
    await savePlan(next);
    setPlan(next);
  };

  const backToRecommended = async () => {
    const next = resetWeeklyDays(plan, cw);
    await savePlan(next);
    setPlan(next);
  };

  const tick = (id: string) =>
    updateProgress({
      ...progress,
      done: { ...progress.done, [id]: !progress.done[id] },
    });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <TopBar />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{plan.title}</Text>
        <Text style={styles.subtitle}>{plan.summary}</Text>

        <View style={styles.weekBadgeRow}>
          <View style={styles.weekBadge}>
            <Text style={styles.weekBadgeText}>
              Week {cw} of {plan.weeks.length}
            </Text>
          </View>
          {!!week.milestone && (
            <Text style={styles.milestone}>{week.milestone}</Text>
          )}
        </View>

        {
          <>
            {/* This week */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>This week's massage</Text>
              <Text style={styles.target}>{describe(week)}</Text>
              <View style={styles.dots}>
                {Array.from({ length: week.daysPerWeek }).map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i < daysDone && styles.dotDone]}
                  />
                ))}
                <Text style={styles.dotsText}>
                  {Math.min(daysDone, week.daysPerWeek)} of {week.daysPerWeek}{" "}
                  days done
                </Text>
              </View>

              <View style={styles.adjustRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adjustTitle}>Days per week</Text>
                  <Text style={styles.adjustHint}>
                    Changes apply from this week onwards. Recommended: {recDays}
                    .
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    style={[
                      styles.stepBtn,
                      week.daysPerWeek <= minDays && styles.stepBtnOff,
                    ]}
                    onPress={() => changeDays(-1)}
                    disabled={week.daysPerWeek <= minDays}
                    accessibilityLabel="One day fewer per week"
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.stepValue}>{week.daysPerWeek}</Text>
                  <Pressable
                    style={[
                      styles.stepBtn,
                      week.daysPerWeek >= maxDays && styles.stepBtnOff,
                    ]}
                    onPress={() => changeDays(1)}
                    disabled={week.daysPerWeek >= maxDays}
                    accessibilityLabel="One more day per week"
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
              {week.daysPerWeek < recDays && (
                <Text style={styles.adjustNote}>
                  Fewer days is fine. A steady habit matters more than a perfect
                  one.
                </Text>
              )}
              {week.daysPerWeek > recDays && (
                <Text style={styles.adjustNote}>
                  More than recommended. Keep at least one rest day, and ease
                  off if your scalp feels sore.
                </Text>
              )}
              {week.daysPerWeek !== recDays && (
                <Pressable onPress={backToRecommended}>
                  <Text style={[styles.link, { marginTop: spacing.xs }]}>
                    Back to recommended ({recDays})
                  </Text>
                </Pressable>
              )}

              <Text style={styles.label}>How each session works</Text>
              <Text style={styles.line}>• {plan.program.rotationNote}</Text>
              {buildGuide(
                "hairline",
                week.minutesPerSession * 60,
                plan.program,
                week.press,
              ).map((s) => (
                <Text key={s.id} style={styles.line}>
                  • {plan.program.phases[s.phase].label}: {mmss(s.seconds)}
                </Text>
              ))}
              <Text style={styles.line}>
                • Sides sessions add a ridge pinch along the sides and nape.
              </Text>
              {!!week.pressNote && (
                <Text style={styles.line}>• {week.pressNote}</Text>
              )}

              <Text style={styles.label}>Technique</Text>
              {week.techniques.map((t) => (
                <Text key={t} style={styles.line}>
                  • {t}
                </Text>
              ))}
              <Text style={[styles.line, { marginTop: spacing.xs }]}>
                • {plan.pressureRule}
              </Text>
              {plan.preferredTime === "evening" && (
                <Text style={styles.line}>
                  • Evenings work best for you: it helps you wind down.
                </Text>
              )}

              <Pressable
                style={styles.outlineBtn}
                onPress={async () => {
                  await setSessionLengthMin(week.minutesPerSession);
                  router.navigate("/");
                }}
              >
                <Text style={styles.outlineBtnText}>
                  Set my timer to {week.minutesPerSession} min
                </Text>
              </Pressable>
            </View>

            {/* Tasks */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>This week's to-do</Text>
              {week.tasks.map((t) =>
                t.type === "shedding_check" ? (
                  <View key={t.id} style={styles.taskBlock}>
                    <Text style={styles.line}>{t.text}</Text>
                    <View style={styles.choiceRow}>
                      {(["less", "same", "more"] as const).map((c) => (
                        <Pressable
                          key={c}
                          style={[
                            styles.choice,
                            progress.shedding[cw] === c && styles.choiceOn,
                          ]}
                          onPress={() =>
                            updateProgress({
                              ...progress,
                              shedding: { ...progress.shedding, [cw]: c },
                            })
                          }
                        >
                          <Text
                            style={[
                              styles.choiceText,
                              progress.shedding[cw] === c &&
                                styles.choiceTextOn,
                            ]}
                          >
                            {c === "less"
                              ? "Less"
                              : c === "same"
                                ? "Same"
                                : "More"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : (
                  <Pressable
                    key={t.id}
                    style={styles.task}
                    onPress={() => tick(t.id)}
                    accessibilityRole="checkbox"
                  >
                    <Ionicons
                      name={progress.done[t.id] ? "checkbox" : "square-outline"}
                      size={22}
                      color={
                        progress.done[t.id] ? colors.primary : colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.taskText,
                        progress.done[t.id] && styles.taskDone,
                      ]}
                    >
                      {t.text}
                    </Text>
                  </Pressable>
                ),
              )}
              <Pressable
                onPress={() =>
                  updateProgress({ ...progress, irritation: true })
                }
                style={{ marginTop: spacing.sm }}
              >
                <Text style={styles.link}>
                  {progress.irritation
                    ? "Noted: we'll suggest an easier plan at your next review."
                    : "My scalp feels irritated"}
                </Text>
              </Pressable>
            </View>

            {/* Review */}
            {showReview && review && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Your weekly review</Text>
                <Text style={styles.body}>
                  Consistency over the last weeks:{" "}
                  {Math.round(review.adherence * 100)}%
                </Text>
                <Text style={[styles.body, { marginTop: spacing.xs }]}>
                  {review.message}
                </Text>
                {review.action !== "keep" ? (
                  <View style={styles.choiceRow}>
                    <Pressable
                      style={[styles.choice, styles.choiceOn]}
                      onPress={applyReviewNow}
                    >
                      <Text style={styles.choiceTextOn}>
                        {review.action === "step_up"
                          ? "Move up"
                          : review.action === "simplify"
                            ? "Make it easier"
                            : "Go gentler"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.choice}
                      onPress={() =>
                        updateProgress({ ...progress, reviewedWeek: cw })
                      }
                    >
                      <Text style={styles.choiceText}>Not now</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() =>
                      updateProgress({ ...progress, reviewedWeek: cw })
                    }
                  >
                    <Text style={[styles.link, { marginTop: spacing.sm }]}>
                      Got it
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        }

        {/* All weeks */}
        <Pressable
          style={styles.sectionToggle}
          onPress={() => setShowAll(!showAll)}
        >
          <Text style={styles.cardTitle}>All 12 weeks</Text>
          <Ionicons
            name={showAll ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.textMuted}
          />
        </Pressable>
        {showAll &&
          plan.weeks.map((w) => {
            return (
              <View
                key={w.week}
                style={[styles.weekRow, w.week === cw && styles.weekRowNow]}
              >
                <Text style={styles.weekNum}>Week {w.week}</Text>
                <Text style={styles.weekText}>{describe(w)}</Text>
              </View>
            );
          })}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What to expect</Text>
          <Text style={styles.body}>{plan.expectation}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Stay safe</Text>
          {plan.safetyNotes.map((n) => (
            <Text key={n} style={styles.line}>
              • {n}
            </Text>
          ))}
        </View>

        <Pressable onPress={confirmReset} style={{ marginTop: spacing.md }}>
          <Text style={styles.link}>Start over with a new plan</Text>
        </Pressable>
        <Text style={styles.disclaimer}>
          A habit plan for scalp care, not medical advice and not a treatment
          for hair loss.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { ...typography.h1, color: colors.text },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    lineHeight: 21,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  gateCard: { borderColor: colors.primary },
  lockCard: { borderColor: colors.primaryDark },
  cardTitle: { ...typography.h3, color: colors.text },
  body: {
    ...typography.body,
    color: colors.text,
    lineHeight: 21,
    marginTop: spacing.xs,
  },
  target: {
    ...typography.h1,
    fontSize: 22,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: "700",
    marginTop: spacing.md,
    marginBottom: 2,
  },
  line: {
    ...typography.body,
    color: colors.text,
    lineHeight: 21,
    marginTop: 2,
  },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  weekBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: "wrap",
  },
  weekBadge: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  weekBadgeText: { ...typography.caption, color: "#fff", fontWeight: "700" },
  milestone: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.sm,
    flexWrap: "wrap",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.track,
  },
  dotDone: { backgroundColor: colors.primary },
  dotsText: {
    ...typography.caption,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  adjustTitle: { ...typography.body, color: colors.text, fontWeight: "700" },
  adjustHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  adjustNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 17,
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnOff: { opacity: 0.3 },
  stepBtnText: { fontSize: 20, color: colors.primary, lineHeight: 22 },
  stepValue: {
    ...typography.h3,
    color: colors.text,
    minWidth: 22,
    textAlign: "center",
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: spacing.md,
  },
  primaryBtnText: { ...typography.body, color: "#fff", fontWeight: "700" },
  outlineBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: spacing.md,
  },
  outlineBtnText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: "700",
  },
  task: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
    alignItems: "flex-start",
  },
  taskText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 21 },
  taskDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  taskBlock: { marginTop: spacing.md },
  choiceRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  choiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { ...typography.body, color: colors.text },
  choiceTextOn: { ...typography.body, color: "#fff", fontWeight: "700" },
  link: { ...typography.caption, color: colors.primaryDark, fontWeight: "700" },
  sectionToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  weekRowNow: { backgroundColor: colors.track },
  weekNum: { ...typography.body, color: colors.text, fontWeight: "700" },
  weekText: {
    ...typography.body,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: "right",
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});
