import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { QUESTIONS, STEPS, type Answers } from '@/constants/onboardingQuestions';
import { loadOnboarding, saveOnboarding } from '@/utils/onboardingStorage';

const ADVANCE_DELAY_MS = 180;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [ready, setReady] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [index, setIndex] = useState(0);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resume where the user left off.
  useEffect(() => {
    let alive = true;
    loadOnboarding().then((saved) => {
      if (!alive) return;
      setAnswers(saved.answers);
      setIndex(Math.min(saved.stepIndex, STEPS.length - 1));
      setReady(true);
    });
    return () => {
      alive = false;
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);

  // Save on every change, only after the initial load so we never overwrite saved data.
  useEffect(() => {
    if (!ready) return;
    saveOnboarding({ answers, stepIndex: index });
  }, [answers, index, ready]);

  const finish = useCallback(
    async (finalAnswers: Answers) => {
      await saveOnboarding({
        answers: finalAnswers,
        stepIndex: STEPS.length - 1,
        completedAt: new Date().toISOString(),
      });
      router.push('/onboarding/photo');
    },
    [router],
  );

  const goNext = useCallback(
    (latest: Answers) => {
      if (index >= STEPS.length - 1) {
        finish(latest);
      } else {
        setIndex((i) => i + 1);
      }
    },
    [index, finish],
  );

  const goBack = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!ready) {
    return <View style={styles.root} />;
  }

  const step = STEPS[index];
  const progress = (index + 1) / STEPS.length;
  const question = step.kind === 'question' ? QUESTIONS[step.questionId] : null;
  const selected = question ? answers[question.id] ?? [] : [];

  const onPick = (value: string) => {
    if (!question) return;

    if (question.type === 'single') {
      const next = { ...answers, [question.id]: [value] };
      setAnswers(next);
      if (question.tip) return; // Screens with a tip use the Continue button instead.
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => goNext(next), ADVANCE_DELAY_MS);
      return;
    }

    // Multi-select with an optional exclusive option.
    let nextValues: string[];
    if (selected.includes(value)) {
      nextValues = selected.filter((v) => v !== value);
    } else if (question.exclusive && value === question.exclusive) {
      nextValues = [value];
    } else {
      nextValues = [...selected.filter((v) => v !== question.exclusive), value];
    }
    setAnswers({ ...answers, [question.id]: nextValues });
  };

  const needsContinue = step.kind === 'info' || question?.type === 'multi' || !!question?.tip;
  const continueDisabled = !!question && selected.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={goBack}
          disabled={index === 0}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={[styles.backBtn, index === 0 && styles.hidden]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {step.kind === 'info' ? (
          <View style={styles.infoBlock}>
            <Text style={styles.title}>{step.title}</Text>
            <Text style={styles.infoBody}>{step.body}</Text>
          </View>
        ) : (
          question && (
            <>
              <Text style={styles.title}>{question.title}</Text>
              {question.subtitle ? <Text style={styles.subtitle}>{question.subtitle}</Text> : null}
              <View style={styles.options}>
                {question.options.map((opt) => {
                  const isOn = selected.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => onPick(opt.value)}
                      accessibilityRole={question.type === 'multi' ? 'checkbox' : 'button'}
                      accessibilityState={{ selected: isOn, checked: isOn }}
                      style={[styles.option, isOn && styles.optionOn]}
                    >
                      <Text style={[styles.optionText, isOn && styles.optionTextOn]}>{opt.label}</Text>
                      {question.type === 'multi' ? (
                        <Ionicons
                          name={isOn ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={isOn ? colors.primary : colors.textMuted}
                        />
                      ) : isOn ? (
                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              {question.tip ? (
                <View style={styles.tipBox}>
                  <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                  <Text style={styles.tipText}>{question.tip}</Text>
                </View>
              ) : null}
            </>
          )
        )}
      </ScrollView>

      {/* Continue is needed for multi-select, tip and info screens; other single-select screens auto-advance. */}
      {needsContinue && (
        <Pressable
          onPress={() => goNext(answers)}
          disabled={continueDisabled}
          accessibilityRole="button"
          style={[styles.cta, continueDisabled && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.background },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
  track: { flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.primary },
  content: { flexGrow: 1, paddingBottom: spacing.md },
  title: { ...typography.h1, color: colors.text, lineHeight: 34 },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm },
  options: { marginTop: spacing.lg + spacing.xs, gap: spacing.sm + 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.track },
  optionText: { ...typography.h3, color: colors.text, fontWeight: '500' },
  optionTextOn: { fontWeight: '700' },
  tipBox: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    marginTop: spacing.lg - 4,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.track,
  },
  tipText: { ...typography.body, flex: 1, lineHeight: 21, color: colors.text },
  infoBlock: { flex: 1, justifyContent: 'center' },
  infoBody: { ...typography.h3, fontWeight: '400', color: colors.textMuted, marginTop: spacing.sm + 4, lineHeight: 26 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { ...typography.h3, color: '#fff' },
});