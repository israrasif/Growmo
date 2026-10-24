import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  type ImageSourcePropType,
  Linking,
  Platform,
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
import { contentColumn } from '@/utils/responsive';
import { deleteOnboardingPhoto, loadOnboarding, saveOnboarding } from '@/utils/onboardingStorage';
import { buildPlan, planLines, type PlanSummary } from '@/utils/onboardingPlan';
import { getPlusPackages, getPurchasesIssue, purchasePlus, restorePlus, type PlusPackages } from '@/utils/purchases';

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

// TODO (links): put your real web addresses here. Google Play and the App Store both expect these links on the
// purchase screen. A link left empty is simply not shown.
const TERMS_URL = '';
const PRIVACY_URL = '';

const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
const MANAGE_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

type Choice = 'annual' | 'monthly';

export default function PitchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [hasPhoto, setHasPhoto] = useState(false);

  const [packages, setPackages] = useState<PlusPackages | null>(null); // null = still loading
  const [choice, setChoice] = useState<Choice>('annual');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; title?: string; text: string } | null>(null);

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

  // The terms people agree to when they tap Get Plus: price, period, automatic renewal and how to cancel.
  const period = selected && packages && selected === packages.annual ? 'year' : 'month';
  const disclosure = selected
    ? `${selected.product.priceString} per ${period}. Renews automatically until you cancel. Cancel anytime in ${STORE_NAME}.`
    : `Renews automatically until you cancel. Cancel anytime in ${STORE_NAME}.`;

  // A confirmed purchase goes to the analysis screen, which shows the payment confirmation and the results.
  // Onboarding is only marked finished at the very end of that screen.
  const afterPurchase = (synced: boolean) => {
    router.replace({ pathname: '/onboarding/analysis', params: { synced: synced ? '1' : '0' } } as never);
  };

  const onGetPlus = async () => {
    if (busy) return;
    setNotice(null);
    if (!selected) {
      setNotice({
        kind: 'error',
        text:
          'We could not load the plans right now. Check your connection and try again.' +
          (__DEV__ && getPurchasesIssue() ? `\n\n[debug] ${getPurchasesIssue()}` : ''),
      });
      loadPackages();
      return;
    }
    setBusy('buy');
    const result = await purchasePlus(selected);
    setBusy(null);

    if (result.status === 'success') {
      afterPurchase(result.synced);
    } else if (result.status === 'error') {
      setNotice({ kind: 'error', title: 'The payment did not go through', text: result.message });
    } else if (result.status === 'pending') {
      setNotice({
        kind: 'info',
        text: 'Your payment is still being processed by the store. Plus switches on as soon as it completes. You can use Restore purchases later if it does not.',
      });
    } else {
      setNotice({ kind: 'info', text: 'Purchase cancelled. You have not been charged.' });
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setNotice(null);
    setBusy('restore');
    const result = await restorePlus();
    setBusy(null);

    if (result.status === 'restored') {
      afterPurchase(result.synced);
    } else if (result.status === 'none') {
      setNotice({ kind: 'info', text: 'We could not find an active Plus subscription for this store account.' });
    } else {
      setNotice({ kind: 'error', text: result.message });
    }
  };

  const onContinueFree = async () => {
    if (busy) return;
    await deleteOnboardingPhoto(); // Free users do not keep or analyze the onboarding photo.
    // Marking onboarding finished makes the root layout switch to the app by itself.
    await saveOnboarding({ finished: true });
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
            <View>
              <Pressable onPress={loadPackages} accessibilityRole="button">
                <Text style={styles.link}>Plans are unavailable right now. Tap to retry.</Text>
              </Pressable>
              {__DEV__ && !!getPurchasesIssue() && (
                <Text style={styles.debug}>[debug] {getPurchasesIssue()}</Text>
              )}
            </View>
          ) : (
            <>
              {renderOption('annual', 'Yearly', packages.annual)}
              {renderOption('monthly', 'Monthly', packages.monthly)}
            </>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {notice && (
          <View style={[styles.notice, notice.kind === 'error' ? styles.noticeError : styles.noticeInfo]}>
            <Ionicons
              name={notice.kind === 'error' ? 'alert-circle' : 'information-circle'}
              size={20}
              color={notice.kind === 'error' ? colors.danger : colors.primary}
            />
            <View style={{ flex: 1 }}>
              {!!notice.title && <Text style={styles.noticeTitle}>{notice.title}</Text>}
              <Text style={styles.noticeText}>{notice.text}</Text>
            </View>
          </View>
        )}
        <Pressable
          onPress={onGetPlus}
          disabled={busy !== null}
          accessibilityRole="button"
          style={[styles.cta, busy !== null && styles.ctaBusy]}
        >
          {busy === 'buy' ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Get Plus</Text>}
        </Pressable>
        <Text style={styles.fine}>{disclosure}</Text>
        <View style={styles.legalRow}>
          {!!TERMS_URL && (
            <Pressable onPress={() => openUrl(TERMS_URL)} hitSlop={8} accessibilityRole="link">
              <Text style={styles.fineLink}>Terms</Text>
            </Pressable>
          )}
          {!!PRIVACY_URL && (
            <Pressable onPress={() => openUrl(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
              <Text style={styles.fineLink}>Privacy Policy</Text>
            </Pressable>
          )}
          <Pressable onPress={() => openUrl(MANAGE_URL)} hitSlop={8} accessibilityRole="link">
            <Text style={styles.fineLink}>Manage subscription</Text>
          </Pressable>
        </View>
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
  root: { flex: 1, backgroundColor: colors.background, ...contentColumn },
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
  debug: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
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
  fine: { ...typography.body, fontSize: 13, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center', lineHeight: 18 },
  legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, marginTop: spacing.xs },
  notice: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: spacing.sm + 2,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    marginBottom: spacing.sm + 4,
  },
  noticeError: { backgroundColor: colors.track, borderWidth: 1, borderColor: colors.danger },
  noticeInfo: { backgroundColor: colors.track },
  noticeTitle: { ...typography.body, color: colors.text, fontWeight: '700' },
  noticeText: { ...typography.body, fontSize: 14, color: colors.text, lineHeight: 20 },
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