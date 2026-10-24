// app/onboarding/_layout.tsx
// The onboarding screens live in their own stack. The root layout shows this group until onboarding is finished.
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { colors } from "@/constants/theme";
import { hasPlus, usePlan } from "@/utils/entitlements";

export default function OnboardingLayout() {
  const router = useRouter();
  const plus = hasPlus(usePlan());
  const screen = (useSegments() as string[])[1]; // undefined or "index" = the first question screen
  const atStart = !screen || screen === "index";

  // Someone who already has Plus but never finished onboarding (they closed the app after paying, or signed in
  // on a new phone) should not be asked to buy again. Send them straight to the last step.
  useEffect(() => {
    if (plus && atStart) {
      router.replace({ pathname: "/onboarding/analysis", params: { synced: "1", resume: "1" } } as never);
    }
  }, [plus, atStart, router]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="photo" />
      {/* No swiping back out of these screens */}
      <Stack.Screen name="building" options={{ gestureEnabled: false }} />
      <Stack.Screen name="pitch" options={{ gestureEnabled: false }} />
      <Stack.Screen name="analysis" options={{ gestureEnabled: false }} />
    </Stack>
  );
}