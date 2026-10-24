import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing, typography } from "@/constants/theme";
import { contentColumn } from "@/utils/responsive";
import { usePhotoCapture } from "@/components/usePhotoCapture";
import {
  loadOnboarding,
  saveOnboarding,
  saveOnboardingPhoto,
} from "@/utils/onboardingStorage";

export default function OnboardingPhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Show the photo again if the user comes back to this step.
  useEffect(() => {
    loadOnboarding().then((s) => s.photoUri && setPhotoUri(s.photoUri));
  }, []);

  // Same capture flow as the vault: instructions (first time) -> camera or library.
  const {
    takePhoto,
    choosePhoto,
    ui: captureUI,
  } = usePhotoCapture(async (uri) => {
    const saved = await saveOnboardingPhoto(uri); // kept on the device only, nothing is uploaded here
    setPhotoUri(saved);
    await saveOnboarding({ photoUri: saved });
  });

  const goNext = async (withPhoto: boolean) => {
    await saveOnboarding({
      photoStepDone: true,
      ...(withPhoto ? {} : { photoUri: undefined }),
    });
    router.push("/onboarding/building");
  };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.sm,
          paddingBottom: insets.bottom + spacing.md,
        },
      ]}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={styles.backBtn}
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Add a photo of your hair</Text>
        <Text style={styles.subtitle}>
          Your photo gives your hair analysis a starting point. You will see
          your results after you choose your plan.
        </Text>

        {photoUri ? (
          <View style={styles.previewWrap}>
            <Image
              source={{ uri: photoUri }}
              style={styles.preview}
              resizeMode="cover"
            />
            <Pressable
              onPress={takePhoto}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Retake photo</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.tipBox}>
            <Ionicons name="sunny-outline" size={20} color={colors.primary} />
            <Text style={styles.tipText}>
              Use bright, even light with dry hair parted the way you usually
              wear it. The camera guides you.
            </Text>
          </View>
        )}
      </ScrollView>

      {photoUri ? (
        <Pressable
          onPress={() => goNext(true)}
          accessibilityRole="button"
          style={styles.cta}
        >
          <Text style={styles.ctaText}>Continue</Text>
        </Pressable>
      ) : (
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
            onPress={() => goNext(false)}
            hitSlop={8}
            accessibilityRole="button"
            style={styles.skip}
          >
            <Text style={styles.link}>Continue without a photo</Text>
          </Pressable>
        </>
      )}

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
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  content: { flexGrow: 1, paddingBottom: spacing.md },
  title: { ...typography.h1, color: colors.text, lineHeight: 34 },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  tipBox: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginTop: spacing.lg,
    padding: spacing.md - 2,
    borderRadius: radii.md,
    backgroundColor: colors.track,
  },
  tipText: { ...typography.body, flex: 1, lineHeight: 21, color: colors.text },
  previewWrap: { marginTop: spacing.lg, alignItems: "center", gap: spacing.md },
  preview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.track,
  },
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
  skip: { alignItems: "center", marginTop: spacing.md },
  link: { ...typography.body, color: colors.primary, fontWeight: "600" },
});
