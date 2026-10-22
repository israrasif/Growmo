// components/PlanIntake.tsx
// Four quick questions before the plan is built.
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/constants/theme";
import type { PlanIntake as Intake, ScalpState, ThinningArea } from "@/utils/planBuilder";

type Step = {
  key: keyof Intake;
  title: string;
  hint?: string;
  options: { label: string; value: any; note?: string }[];
};

const STEPS: Step[] = [
  {
    key: "thinningArea",
    title: "Where do you notice thinning?",
    options: [
      { label: "Front or temples", value: "front" as ThinningArea },
      { label: "Crown (top-back of the head)", value: "crown" as ThinningArea },
      { label: "All over", value: "diffuse" as ThinningArea },
      { label: "Round or patchy bald spots", value: "patchy" as ThinningArea },
      { label: "None, I just want to look after my hair", value: "none" as ThinningArea },
    ],
  },
  {
    key: "scalpState",
    title: "How does your scalp feel?",
    options: [
      { label: "Comfortable", value: "comfortable" as ScalpState },
      { label: "Sometimes itchy, flaky or tender", value: "sensitive" as ScalpState },
      {
        label: "Sores, a rash, an infection, or a diagnosed scalp condition",
        value: "problem" as ScalpState,
        note: "For example psoriasis, eczema or seborrheic dermatitis",
      },
    ],
  },
  {
    key: "shedCheckedByDoctor",
    title: "Has a doctor looked at your hair shedding or thinning?",
    options: [
      { label: "Yes", value: true },
      { label: "Not yet", value: false },
    ],
  },
  {
    key: "minutesAvailable",
    title: "How long can one session be?",
    hint: "You'll do two sessions a day, one scalp area each time. Be honest: a smaller habit you keep beats a bigger one you drop.",
    options: [
      { label: "About 5 minutes", value: 5 },
      { label: "About 10 minutes", value: 10 },
      { label: "About 15 minutes", value: 15 },
      { label: "20 minutes", value: 20 },
    ],
  },
];

export default function PlanIntake({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: (intake: Intake) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Intake>>({});

  const reset = () => {
    setStep(0);
    setAnswers({});
  };

  const choose = (value: any) => {
    const next = { ...answers, [STEPS[step].key]: value } as Partial<Intake>;
    if (step < STEPS.length - 1) {
      setAnswers(next);
      setStep(step + 1);
      return;
    }
    onDone(next as Intake);
    reset();
  };

  const back = () => {
    if (step === 0) {
      reset();
      onClose();
    } else setStep(step - 1);
  };

  const s = STEPS[step];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={back}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.top}>
          <Pressable onPress={back} hitSlop={12} accessibilityLabel="Back">
            <Ionicons name={step === 0 ? "close" : "chevron-back"} size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.progress}>
            Step {step + 1} of {STEPS.length}
          </Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>{s.title}</Text>
          {!!s.hint && <Text style={styles.hint}>{s.hint}</Text>}
          {s.options.map((o) => (
            <Pressable key={o.label} style={styles.option} onPress={() => choose(o.value)} accessibilityRole="button">
              <Text style={styles.optionText}>{o.label}</Text>
              {!!o.note && <Text style={styles.note}>{o.note}</Text>}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  progress: { ...typography.caption, color: colors.textMuted },
  track: {
    height: 6,
    backgroundColor: colors.track,
    borderRadius: 3,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    overflow: "hidden",
  },
  fill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  body: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  title: { ...typography.h3, color: colors.text, lineHeight: 26 },
  hint: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  option: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  optionText: { ...typography.body, color: colors.text },
  note: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});