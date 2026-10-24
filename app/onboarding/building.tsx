import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { contentColumn } from '@/utils/responsive';
import Confetti from '@/components/Confetti';

const NEXT_ROUTE = '/onboarding/pitch';

const MESSAGES = [
  'Reading your answers',
  'Mapping your scalp areas',
  'Setting your rotation',
  'Finishing your plan',
];
const STEP_MS = 900;

export default function BuildingPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [messageIndex, setMessageIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    (async () => {
      const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (!alive) return;
      setReduceMotion(reduce);

      const total = reduce ? 600 : MESSAGES.length * STEP_MS;
      if (!reduce) {
        Animated.timing(progress, {
          toValue: 1,
          duration: total,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }).start();
        MESSAGES.forEach((_, i) => {
          if (i > 0) timers.push(setTimeout(() => alive && setMessageIndex(i), i * STEP_MS));
        });
      } else {
        progress.setValue(1);
        setMessageIndex(MESSAGES.length - 1);
      }
      timers.push(setTimeout(() => alive && setDone(true), total));
    })();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [progress]);

  // Celebrate: the check pops in, a success buzz, and confetti (the confetti is skipped with Reduce Motion).
  useEffect(() => {
    if (!done) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (reduceMotion) {
      pop.setValue(1);
      return;
    }
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [done, reduceMotion, pop]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.md },
      ]}
    >
      {!done ? (
        <View style={styles.center}>
          <Text style={styles.title}>Building your plan</Text>
          <Text style={styles.message} accessibilityLiveRegion="polite">
            {MESSAGES[messageIndex]}
          </Text>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, { width }]} />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.center}>
            <Animated.View
              style={[
                styles.badge,
                { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] },
              ]}
            >
              <Ionicons name="checkmark" size={56} color="#fff" />
            </Animated.View>
            <Text style={[styles.title, { marginTop: spacing.lg }]}>Your plan is ready</Text>
            <Text style={styles.message}>Here is what we set up for you.</Text>
          </View>
          <Pressable
            onPress={() => router.replace(NEXT_ROUTE as never)}
            accessibilityRole="button"
            style={styles.cta}
          >
            <Text style={styles.ctaText}>See my plan</Text>
          </Pressable>
        </>
      )}

      <Confetti active={done && !reduceMotion} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: spacing.lg, backgroundColor: colors.background, ...contentColumn },
  center: { flex: 1, justifyContent: 'center', alignItems: 'stretch' },
  title: { ...typography.h1, color: colors.text, textAlign: 'center' },
  message: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm + 4,
    minHeight: 22,
  },
  track: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: spacing.lg,
  },
  fill: { height: 8, borderRadius: radii.pill, backgroundColor: colors.primary },
  badge: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaText: { ...typography.h3, color: '#fff' },
});