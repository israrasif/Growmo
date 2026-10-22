import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { Answers } from '@/constants/onboardingQuestions';

const KEY = 'onboarding:v1';
const PHOTO_NAME = 'onboarding-photo.jpg';

export type OnboardingState = {
  answers: Answers;
  /** Index into STEPS of the screen to resume on. */
  stepIndex: number;
  /** ISO timestamp, set when the last question is answered. */
  completedAt?: string;
  /** Local file URI of the photo taken in onboarding. Stays on the device until Plus is purchased. */
  photoUri?: string;
  /** True once the user has taken a photo or chosen to continue without one. */
  photoStepDone?: boolean;
  /** True once the user has left onboarding (chose Free or completed a Plus purchase). Use for launch gating. */
  finished?: boolean;
};

export const EMPTY_ONBOARDING: OnboardingState = { answers: {}, stepIndex: 0 };

export async function loadOnboarding(): Promise<OnboardingState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return EMPTY_ONBOARDING;
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      answers: parsed.answers ?? {},
      stepIndex: typeof parsed.stepIndex === 'number' ? parsed.stepIndex : 0,
      completedAt: parsed.completedAt,
      photoUri: parsed.photoUri,
      photoStepDone: parsed.photoStepDone,
      finished: parsed.finished,
    };
  } catch {
    // Corrupt or unreadable data: start fresh rather than block the user.
    return EMPTY_ONBOARDING;
  }
}

/** Merges the given fields into what is already saved, so one screen never wipes another's data. */
export async function saveOnboarding(patch: Partial<OnboardingState>): Promise<void> {
  try {
    const current = await loadOnboarding();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Non-fatal: answers stay in memory for this session.
  }
}

/** Copies the picked/captured photo into app storage so it survives cache clean-ups. Returns the new URI. */
export async function saveOnboardingPhoto(sourceUri: string): Promise<string> {
  const dir = FileSystem.documentDirectory;
  if (!dir) return sourceUri;
  const dest = `${dir}${PHOTO_NAME}`;
  try {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    await FileSystem.copyAsync({ from: sourceUri, to: dest });
    return dest;
  } catch {
    return sourceUri;
  }
}

/** Removes the onboarding photo from the device (used when the user continues with Free). */
export async function deleteOnboardingPhoto(): Promise<void> {
  const dir = FileSystem.documentDirectory;
  if (!dir) return;
  try {
    await FileSystem.deleteAsync(`${dir}${PHOTO_NAME}`, { idempotent: true });
  } catch {
    // ignore
  }
  await saveOnboarding({ photoUri: undefined });
}

export async function clearOnboarding(): Promise<void> {
  await deleteOnboardingPhoto(); // first, because it re-saves state
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}