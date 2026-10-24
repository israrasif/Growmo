import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase";
import { createSessionFromUrl } from "@/utils/authLink";
import { colors } from "@/constants/theme";
import { useDataSyncTriggers } from "@/utils/useDataSync";
import { usePurchasesSetup } from "@/utils/usePurchasesSetup";
import { useOnboardingFinished } from "@/utils/onboardingStorage";
import { useOnboardingAnswersSync } from "@/utils/onboardingSync";

export default function RootLayout() {
  useDataSyncTriggers();
  usePurchasesSetup(); // starts RevenueCat and ties purchases to the signed-in user
  useOnboardingAnswersSync(); // saves the onboarding answers to the account (and retries if that failed)
  // undefined = still checking for a saved session, null = signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // undefined = still loading, false = new user who needs onboarding, true = done.
  const onboardingFinished = useOnboardingFinished();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Email confirmation / magic links open the app with tokens in the URL.
  // Turn them into a session; the guard below then moves the user into the app.
  const url = Linking.useLinkingURL();
  useEffect(() => {
    if (url) createSessionFromUrl(url).catch(() => {});
  }, [url]);

  if (session === undefined || onboardingFinished === undefined) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {/* Signed in and onboarded: the app. Signed in but new: onboarding. Signed out: login.
            When a guard changes (a session change, or onboarding finishing), the app switches automatically. */}
        <Stack.Protected guard={!!session && onboardingFinished}>
          <Stack.Screen name="(drawer)" />
        </Stack.Protected>
        <Stack.Protected guard={!!session && !onboardingFinished}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
