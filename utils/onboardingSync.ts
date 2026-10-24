// utils/onboardingSync.ts
// Saves the onboarding answers to the user's account (table onboarding_answers).
// Safe to call any time: it does nothing until onboarding is complete and the user is signed in, and it retries
// on the next launch if the first attempt fails (for example when offline).
import { useEffect } from 'react';
import { supabase } from '@/utils/supabase';
import { loadOnboarding, saveOnboarding } from '@/utils/onboardingStorage';

const first = (values?: string[]) => values?.[0] ?? null;

let running = false;

export async function syncOnboardingAnswers(): Promise<boolean> {
  if (running) return false;
  running = true;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;

    const saved = await loadOnboarding();
    if (!saved.completedAt || saved.answersSynced) return false;

    const a = saved.answers;
    const { error } = await supabase.from('onboarding_answers').upsert(
      {
        user_id: userId,
        goals: a.goal ?? [],
        areas: a.areas ?? [],
        duration: first(a.duration),
        hair_type: first(a.hairType),
        scalp_feel: first(a.scalpFeel),
        session_time: first(a.when),
        commitment: first(a.commitment),
        research_consent: first(a.dataConsent) === 'yes',
        answers: a,
        completed_at: saved.completedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    if (error) {
      console.warn('[onboarding] could not save answers', error.message);
      return false;
    }
    await saveOnboarding({ answersSynced: true });
    return true;
  } catch (e) {
    console.warn('[onboarding] could not save answers', e);
    return false;
  } finally {
    running = false;
  }
}

/** Call once in the root layout: tries on launch and whenever the user signs in. */
export function useOnboardingAnswersSync() {
  useEffect(() => {
    syncOnboardingAnswers();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Avoid awaiting Supabase calls inside this callback.
      if (session) setTimeout(() => syncOnboardingAnswers(), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
}