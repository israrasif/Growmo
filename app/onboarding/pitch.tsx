import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { PurchasesPackage } from 'react-native-purchases';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { deleteOnboardingPhoto, loadOnboarding, saveOnboarding } from '@/utils/onboardingStorage';
import { buildPlan, planLines, type PlanSummary } from '@/utils/onboardingPlan';
import { getPlusPackages, purchasePlus, restorePlus, type PlusPackages } from '@/utils/purchases';

// TODO (copy): replace the wording below with the final text.
const HEADLINE = 'Your personalized plan is ready';
const BENEFITS = [
  'Full technique guide for every scalp area',
  'A plan that builds up week by week',
  '2 AI hair analyses a month, with trends',
  'Photo comparison, up to 20 photos a month',
  'Quarterly progress recaps',
];

// TODO (assets): your own before/after image, e.g. require('@/assets/images/my-results.jpg').
const RESULT_IMAGE: ImageSourcePropType | null = null;
const RESULT_CAPTION = 'My results over time. Results vary from person to person.';

type Choice = 'annual' | 'monthly';

export default function PitchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);

  const [packages, setPackages] = useState<PlusPackages | null>(null); // null = still loading
  const [choice, setChoice] = useState<Choice>('annual');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);

  useEffect(() => {
    loadOnboarding().then((s) => {
      setPlan(buildPlan(s.answers));
      setHasPhoto(!!s.photoUri);
    });
  }, []);

  const loadPackages = useCallback(async () => {
    setPackages(null);
    const p = await getPlusPackages();
    setPackages(p);
    setChoice(p.annual ? 'annual' : 'monthly');
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const selected: PurchasesPackage | null =
    packages === null ? null : choice === 'annual' ? packages.annual : packages.monthly;
  const noPlans = packages !== null && !packages.annual && !packages.monthly;

  // Where a successful purchase continues. TODO: send to the analysis reveal + reminders screens once built.
  const afterPurchase = async () => {
    await saveOnboarding({ finished: true });
    router.replace('/');
  };

  const onGetPlus = async () => {
    if (busy) return;
    if (!selected) {
      Alert.alert('Plans unavailable', 'We could not load the plans right now. Check your connection and try again.');
      loadPackages();
      return;
    }
    setBusy('buy');
    const result = await purchasePlus(selected);
    setBusy(null);

    if (result.status === 'success') {
      await afterPurchase();
    } else if (result.status === 'error') {
      Alert.alert('Purchase', result.message);
    }
    // 'cancelled': the user backed out, so do nothing.
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy('restore');
    const result = await restorePlus();
    setBusy(null);

    if (result.status === 'restored') {
      Alert.alert('Plus restored', 'Welcome back.', [{ text: 'Continue', onPress: afterPurchase }]);
    } else if (result.status === 'none') {
      Alert.alert('Nothing to restore', 'We could not find an active Plus subscription for this store account.');
    } else {
      Alert.alert('Restore purchases', result.message);
    }
  };

  const onContinueFree = async () => {
    if (busy) return;
    await deleteOnboardingPhoto(); // Free users do not keep or analyze the onboarding photo.
    await saveOnboarding({ finished: true });
    router.replace('/');
  };

  const renderOption = (key: Choice, label: string, pkg: PurchasesPackage | null) => {
    if (!pkg) return null;
    const on = choice === key;
    return (
      <Pressable
        key={key}
        onPress={() => setChoice(key)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={[styles.planOption, on && styles.planOptionOn]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.planLabel}>{label}</Text>
          <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
        </View>
        <Ionicons
          name={on ? 'radio-button-on' : 'radio-button-off'}
          size={24}
          color={on ? colors.primary : colors.textMuted}
        />
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{HEADLINE}</Text>

        {plan && (
          <View style={styles.card}>
            {planLines(plan).map((line) => (
              <View key={line} style={styles.row}>
                <Ionicons name="checkmark" size={18} color={colors.primary} />
                <Text style={styles.rowText}>{line}</Text>
              </View>
            ))}
          </View>
        )}

        {RESULT_IMAGE && (
          <View style={styles.resultWrap}>
            <Image source={RESULT_IMAGE} style={styles.resultImage} resizeMode="cover" />
            <Text style={styles.caption}>{RESULT_CAPTION}</Text>
          </View>
        )}

        {hasPhoto && (
          <View style={styles.lockedCard}>
            <Ionicons name="lock-closed" size={22} color={colors.primary} />
            <View style={styles.lockedText}>
              <Text style={styles.lockedTitle}>Your hair analysis</Text>
              <Text style={styles.lockedBody}>Ready as soon as you join Plus.</Text>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>What you get with Plus</Text>
        <View style={styles.card}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.row}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={styles.rowText}>{b}</Text>
            </View>
          ))}
        </View>

        <View style={styles.plans}>
          {packages === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : noPlans ? (
            <Pressable onPress={loadPackages} accessibilityRole="button">
              <Text style={styles.link}>Plans are unavailable right now. Tap to retry.</Text>
            </Pressable>
          ) : (
            <>
              {renderOption('annual', 'Yearly', packages.annual)}
              {renderOption('monthly', 'Monthly', packages.monthly)}
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          onPress={onGetPlus}
          disabled={busy !== null}
          accessibilityRole="button"
          style={[styles.cta, busy !== null && styles.ctaBusy]}
        >
          {busy === 'buy' ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Get Plus</Text>}
        </Pressable>
        <Text style={styles.fine}>Cancel anytime in your store settings.</Text>
        <Pressable onPress={onContinueFree} hitSlop={8} accessibilityRole="button" style={styles.freeLink}>
          <Text style={styles.link}>Continue with Free</Text>
        </Pressable>
        <Pressable onPress={onRestore} disabled={busy !== null} hitSlop={8} accessibilityRole="button">
          <Text style={styles.fineLink}>{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  title: { ...typography.h1, color: colors.text, lineHeight: 34 },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm + 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  rowText: { ...typography.body, flex: 1, color: colors.text },
  resultWrap: { marginTop: spacing.lg },
  resultImage: { width: '100%', aspectRatio: 4 / 3, borderRadius: radii.lg, backgroundColor: colors.track },
  caption: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  lockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.track,
  },
  lockedText: { flex: 1 },
  lockedTitle: { ...typography.h3, color: colors.text },
  lockedBody: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  plans: { marginTop: spacing.lg, gap: spacing.sm + 4, minHeight: 40 },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  planOptionOn: { borderColor: colors.primary, backgroundColor: colors.track },
  planLabel: { ...typography.h3, color: colors.text },
  planPrice: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  cta: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    minHeight: 52,
    justifyContent: 'center',
  },
  ctaBusy: { opacity: 0.7 },
  ctaText: { ...typography.h3, color: '#fff' },
  fine: { ...typography.body, fontSize: 13, color: colors.textMuted, marginTop: spacing.sm },
  freeLink: { marginTop: spacing.md },
  link: { ...typography.body, color: colors.primary, fontWeight: '600' },
  fineLink: {
    ...typography.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textDecorationLine: 'underline',
  },
});