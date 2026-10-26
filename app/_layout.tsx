import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
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
import {
  captureError,
  initMonitoring,
  setMonitoringUser,
  wrapRoot,
} from "@/utils/monitoring";
import { flushEvents } from "@/utils/analytics";

initMonitoring(); // crash reporting starts before anything else can go wrong

function RootLayout() {
  useDataSyncTriggers();
  usePurchasesSetup(); // starts RevenueCat and ties purchases to the signed-in user
  useOnboardingAnswersSync(); // saves the onboarding answers to the account (and retries if that failed)
  // undefined = still checking for a saved session, null = signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // undefined = still loading, false = new user who needs onboarding, true = done.
  const onboardingFinished = useOnboardingFinished();

  // Reports carry only an anonymous account id; queued funnel events are sent once signed in
  useEffect(() => {
    setMonitoringUser(session?.user.id ?? null);
    if (session) flushEvents();
  }, [session]);

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

// Crash reporting wraps the whole app. It does nothing in development or without a key.
export default wrapRoot(RootLayout);

/** Shown instead of a blank crash when a screen fails. The error is also reported. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    captureError(error, { where: "screen" });
  }, [error]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: colors.background,
      }}
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: colors.text,
          textAlign: "center",
        }}
      >
        Something went wrong
      </Text>
      <Text
        style={{
          fontSize: 15,
          color: colors.textMuted,
          textAlign: "center",
          marginTop: 8,
        }}
      >
        We have been told about it. Please try again.
      </Text>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        style={{
          backgroundColor: colors.primary,
          borderRadius: 12,
          paddingVertical: 14,
          paddingHorizontal: 28,
          marginTop: 20,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}
