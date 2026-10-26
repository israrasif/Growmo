// app/onboarding/analysis.tsx
// Shown right after a successful Plus purchase: payment confirmation, then the first hair analysis.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { contentColumn } from "@/utils/responsive";
import { usePhotoCapture } from "@/components/usePhotoCapture";
import { analyzeHairPhoto, type Scan } from "@/utils/analyzeHair";
import { addVaultPhoto } from "@/utils/storage";
import { syncVaultPhotos } from "@/utils/vaultSync";
import { waitForPlusInDb } from "@/utils/purchases";
import {
  deleteOnboardingPhoto,
  loadOnboarding,
  saveOnboarding,
} from "@/utils/onboardingStorage";
import {
  describeFailure,
  PHOTO_CHECKLIST,
  type Failure,
} from "@/utils/analysisMessages";
import { track } from "@/utils/analytics";

type Stage =
  | "activating" // waiting for Plus to show up in the database
  | "activation_slow" // paid, but Plus has not switched on yet
  | "need_photo" // no photo was taken during onboarding
  | "analyzing"
  | "result"
  | "unusable" // the photo could not be read
  | "failed"; // upload or analysis error

const METRICS: { key: keyof Scan; label: string }[] = [
  { key: "density", label: "Density" },
  { key: "scalp_coverage", label: "Scalp coverage" },
  { key: "shine", label: "Shine" },
  { key: "integrity", label: "Strand health" },
];

export default function AnalysisScreen() {
  const insets = useSafeAreaInsets();
  const { synced, resume } = useLocalSearchParams<{
    synced?: string;
    resume?: string;
  }>();
  // resume = they already had Plus when they came back to onboarding, so this is not a fresh payment
  const resumed = resume === "1";

  const [stage, setStage] = useState<Stage>("activating");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const started = useRef(false);

  const analyze = useCallback(async (uri: string) => {
    setPhotoUri(uri);
    setMessage(null);
    setTip(null);
    setFailure(null);
    setStage("analyzing");

    const res = await analyzeHairPhoto(uri);
    if (res.ok) {
      setScan(res.scan);
      // The photo becomes the first photo in the vault, so later photos have something to compare with.
      try {
        await addVaultPhoto(uri);
        syncVaultPhotos();
      } catch {
        // The analysis worked; a missing vault photo is not worth failing for.
      }
      await deleteOnboardingPhoto();
      setStage("result");
      track("analysis_result", { outcome: "success" });
    } else if (res.reason === "unusable") {
      setMessage(res.notes || "We couldn't see your hair clearly.");
      setTip(res.photoTips || null);
      setStage("unusable");
      track("analysis_result", { outcome: "unusable" });
    } else {
      const f = describeFailure(res.message);
      setFailure(f);
      setStage("failed");
      track("analysis_result", { outcome: f.kind });
    }
  }, []);

  const begin = useCallback(
    async (verifyPlus: boolean) => {
      setStage("activating");
      if (verifyPlus) {
        const ok = await waitForPlusInDb(20000);
        if (!ok) {
          setStage("activation_slow");
          return;
        }
      }
      const saved = await loadOnboarding();
      if (saved.photoUri) {
        await analyze(saved.photoUri);
      } else {
        setStage("need_photo");
      }
    },
    [analyze],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("analysis_viewed", { resumed });
    // The purchase step already confirmed Plus in the database when synced === '1'.
    begin(synced !== "1");
  }, [begin, synced]);

  // Camera or library (with the first-time photo instructions)
  const { takePhoto, choosePhoto, ui: captureUI } = usePhotoCapture(analyze);

  // Leaving onboarding: the root layout switches to the app once this is saved.
  const finish = async () => {
    track("onboarding_finished", {
      path: resumed ? "plus_resumed" : "plus",
      stage,
    });
    await deleteOnboardingPhoto();
    await saveOnboarding({ finished: true });
  };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.md,
        },
      ]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Payment confirmation */}
        <View style={styles.confirm}>
          <View style={styles.confirmBadge}>
            <Ionicons name="checkmark" size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.confirmTitle}>
              {resumed ? "Welcome back" : "Payment confirmed"}
            </Text>
            <Text style={styles.confirmText}>
              {resumed
                ? "Plus is active on your account."
                : stage === "activation_slow"
                  ? "Your payment went through. We are still switching Plus on."
                  : "Welcome to Plus. Everything is unlocked on your account."}
            </Text>
          </View>
        </View>

        {stage === "activating" && (
          <View style={styles.block}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.blockText}>Switching on Plus…</Text>
          </View>
        )}

        {stage === "activation_slow" && (
          <View style={styles.block}>
            <Text style={styles.heading}>This is taking a little longer</Text>
            <Text style={styles.blockText}>
              Plus can take a minute to show up. You can try again now, or carry
              on and run your hair analysis later from the Analyze tab. Your
              payment is safe either way.
            </Text>
          </View>
        )}

        {stage === "need_photo" && (
          <View style={styles.block}>
            <Text style={styles.heading}>Get your hair analysis</Text>
            <Text style={styles.blockText}>
              Add a photo and we will score it. It also becomes the first photo
              in your vault, so you can see how your hair changes.
            </Text>
          </View>
        )}

        {stage === "analyzing" && (
          <View style={styles.block}>
            {photoUri && (
              <Image source={{ uri: photoUri }} style={styles.preview} />
            )}
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: spacing.md }}
            />
            <Text style={styles.blockText}>
              Analyzing your photo… this takes a few seconds.
            </Text>
          </View>
        )}

        {stage === "unusable" && (
          <View style={styles.block}>
            <Text style={styles.heading}>Let's try that photo again</Text>
            <Text style={styles.blockText}>
              {message || "We couldn't see your hair clearly in that one."}
            </Text>
            <Text style={styles.blockText}>
              This one didn't use up one of your monthly checks, so you can try
              as often as you need.
            </Text>
            {!!tip && <Text style={styles.tip}>Try this: {tip}</Text>}
            <Text style={[styles.heading, styles.checklistTitle]}>
              For a clear photo
            </Text>
            {PHOTO_CHECKLIST.map((line) => (
              <Text key={line} style={styles.checkLine}>
                • {line}
              </Text>
            ))}
          </View>
        )}

        {stage === "failed" && (
          <View style={styles.block}>
            <Text style={styles.heading}>
              {failure?.title ?? "The analysis didn't finish"}
            </Text>
            <Text style={styles.blockText}>{failure?.body ?? message}</Text>
          </View>
        )}

        {stage === "result" && scan && (
          <View style={styles.block}>
            <Text style={styles.heading}>Your hair analysis</Text>
            <View style={styles.overallRow}>
              <Text style={styles.overall}>{scan.overall}/10</Text>
              <Text style={styles.overallLabel}>Overall</Text>
            </View>
            {METRICS.map((m) => {
              const value = Number(scan[m.key]) || 0;
              return (
                <View key={m.key} style={styles.metricRow}>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[styles.barFill, { width: `${value * 10}%` }]}
                    />
                  </View>
                  <Text style={styles.metricValue}>{value}</Text>
                </View>
              );
            })}
            {!!scan.notes && <Text style={styles.blockText}>{scan.notes}</Text>}
            {!!scan.photo_tips && (
              <Text style={styles.tip}>Next photo: {scan.photo_tips}</Text>
            )}
            <Text style={styles.disclaimer}>
              These scores are visual estimates from one photo. They are not a
              medical assessment.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        {stage === "activation_slow" && (
          <>
            <Pressable
              onPress={() => begin(true)}
              accessibilityRole="button"
              style={styles.cta}
            >
              <Text style={styles.ctaText}>Try again</Text>
            </Pressable>
            <Pressable
              onPress={finish}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.linkWrap}
            >
              <Text style={styles.link}>Continue to the app</Text>
            </Pressable>
          </>
        )}

        {stage === "need_photo" && (
          <>
            <Pressable
              onPress={takePhoto}
              accessibilityRole="button"
              style={styles.cta}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.ctaText}>Take photo</Text>
            </Pressable>
            <Pressable
              onPress={choosePhoto}
              accessibilityRole="button"
              style={styles.ctaAlt}
            >
              <Ionicons name="images" size={20} color={colors.primary} />
              <Text style={[styles.ctaText, { color: colors.primary }]}>
                Choose from library
              </Text>
            </Pressable>
            <Pressable
              onPress={finish}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.linkWrap}
            >
              <Text style={styles.link}>Skip for now</Text>
            </Pressable>
          </>
        )}

        {stage === "unusable" && (
          <>
            <Pressable
              onPress={takePhoto}
              accessibilityRole="button"
              style={styles.cta}
            >
              <Ionicons name="camera" size={20} color="#fff" />
              <Text style={styles.ctaText}>Take a new photo</Text>
            </Pressable>
            <Pressable
              onPress={choosePhoto}
              accessibilityRole="button"
              style={styles.ctaAlt}
            >
              <Ionicons name="images" size={20} color={colors.primary} />
              <Text style={[styles.ctaText, { color: colors.primary }]}>
                Choose from library
              </Text>
            </Pressable>
            <Pressable
              onPress={finish}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.linkWrap}
            >
              <Text style={styles.link}>Skip for now</Text>
            </Pressable>
          </>
        )}

        {stage === "failed" && (
          <>
            {failure?.canRetry === false ? (
              <Pressable
                onPress={finish}
                accessibilityRole="button"
                style={styles.cta}
              >
                <Text style={styles.ctaText}>Continue</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() => (photoUri ? analyze(photoUri) : begin(false))}
                  accessibilityRole="button"
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>Try again</Text>
                </Pressable>
                <Pressable
                  onPress={finish}
                  hitSlop={8}
                  accessibilityRole="button"
                  style={styles.linkWrap}
                >
                  <Text style={styles.link}>Skip for now</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {stage === "result" && (
          <Pressable
            onPress={finish}
            accessibilityRole="button"
            style={styles.cta}
          >
            <Text style={styles.ctaText}>Continue</Text>
          </Pressable>
        )}
      </View>

      {captureUI}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    ...contentColumn,
  },
  content: { paddingBottom: spacing.lg },
  confirm: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.track,
  },
  confirmBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmTitle: { ...typography.h3, color: colors.text },
  confirmText: {
    ...typography.body,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: 20,
  },
  block: { marginTop: spacing.lg, alignItems: "stretch" },
  heading: { ...typography.h1, color: colors.text, lineHeight: 34 },
  blockText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  checklistTitle: { fontSize: 20, lineHeight: 26, marginTop: spacing.lg },
  checkLine: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.xs + 2,
    lineHeight: 20,
  },
  tip: {
    ...typography.body,
    fontSize: 14,
    color: colors.text,
    marginTop: spacing.sm + 4,
    lineHeight: 20,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.lg,
    lineHeight: 18,
  },
  preview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.track,
  },
  overallRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  overall: { ...typography.h1, fontSize: 44, color: colors.primary },
  overallLabel: { ...typography.body, color: colors.textMuted },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm + 4,
  },
  metricLabel: { ...typography.body, color: colors.text, width: 112 },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.track,
    overflow: "hidden",
  },
  barFill: {
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
  },
  metricValue: {
    ...typography.body,
    color: colors.textMuted,
    width: 22,
    textAlign: "right",
  },
  actions: { paddingTop: spacing.md },
  cta: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
  },
  ctaAlt: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm + 4,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md - 2,
  },
  ctaText: { ...typography.h3, color: "#fff" },
  linkWrap: { alignItems: "center", marginTop: spacing.md },
  link: { ...typography.body, color: colors.primary, fontWeight: "600" },
});
