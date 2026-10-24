// app/onboarding/_layout.tsx
// The onboarding screens live in their own stack. The root layout shows this group until onboarding is finished.
import { Stack } from "expo-router";
import { colors } from "@/constants/theme";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="photo" />
      {/* No swiping back out of these two */}
      <Stack.Screen name="building" options={{ gestureEnabled: false }} />
      <Stack.Screen name="pitch" options={{ gestureEnabled: false }} />
      <Stack.Screen name="analysis" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
