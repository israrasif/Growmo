// utils/planStore.ts
// Saves the plan on the phone, loads the plan settings (from Supabase if available, else the bundled file),
// and gathers the inputs the plan builder needs.
import AsyncStorage from "@react-native-async-storage/async-storage";
import bundledConfig from "@/data/planConfig.json";
import { supabase } from "@/utils/supabase";
import { requestSync } from "@/utils/syncSignal";
import { getQuizResults, QUESTIONS } from "@/utils/hairQuiz";
import { fetchScans } from "@/utils/analyzeHair";
import type { Plan, QuizInput, ScanInput } from "@/utils/planBuilder";

const PLAN_KEY = "@hair_massage/plan";
const PROGRESS_KEY = "@hair_massage/plan_progress";
const CONFIG_CACHE_KEY = "@hair_massage/plan_config_cache";

export type PlanProgress = {
  done: Record<string, boolean>; // task id -> ticked
  shedding: Record<number, "less" | "same" | "more">; // week -> answer
  irritation: boolean; // user reported irritation (cleared by a review)
  reviewedWeek?: number; // the last week a review suggestion was answered, so it shows once a week
};

const EMPTY_PROGRESS: PlanProgress = {
  done: {},
  shedding: {},
  irritation: false,
};

// ---------------------------------------------------------------- plan
export async function getPlan(): Promise<Plan | null> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_KEY);
    return raw ? (JSON.parse(raw) as Plan) : null;
  } catch {
    return null;
  }
}

/** Used by the cloud sync (doesn't trigger another sync) */
export async function applyPlan(plan: Plan | null): Promise<void> {
  if (plan) await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  else await AsyncStorage.removeItem(PLAN_KEY);
}

export async function savePlan(plan: Plan): Promise<void> {
  await applyPlan(plan);
  requestSync();
}

export async function getProgress(): Promise<PlanProgress> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    return raw ? { ...EMPTY_PROGRESS, ...JSON.parse(raw) } : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export async function applyProgress(p: PlanProgress): Promise<void> {
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
}

export async function saveProgress(p: PlanProgress): Promise<void> {
  await applyProgress(p);
  requestSync();
}

/** Starting over: removes the plan and its ticks */
export async function resetPlan(): Promise<void> {
  await applyPlan(null);
  await applyProgress(EMPTY_PROGRESS);
  requestSync();
}

export const PLAN_STORAGE_KEYS = [PLAN_KEY, PROGRESS_KEY, CONFIG_CACHE_KEY];

// -------------------------------------------------------------- config
// Your plan numbers can be changed without an app update: add a row to the Supabase table `app_config`
// with key = 'plan_config' and the same JSON as data/planConfig.json. If it's missing, offline or invalid,
// the bundled file is used.
function looksValid(c: any): boolean {
  return (
    c &&
    typeof c.version === "number" &&
    c.levels?.L1 &&
    c.levels?.L2 &&
    c.levels?.L3 &&
    c.levels?.L4 &&
    c.profiles &&
    c.zones &&
    c.zoneShort &&
    c.program &&
    c.ramp &&
    c.review &&
    c.gates &&
    Array.isArray(c.habits) &&
    c.tasks
  );
}

export async function getPlanConfig(): Promise<any> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "plan_config")
      .maybeSingle();
    if (!error && data?.value && looksValid(data.value)) {
      await AsyncStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(data.value));
      return data.value;
    }
  } catch {}
  try {
    const cached = await AsyncStorage.getItem(CONFIG_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (looksValid(parsed)) return parsed;
    }
  } catch {}
  return bundledConfig;
}

// -------------------------------------------------------------- inputs
/** Latest questionnaire result in the shape the plan builder wants, or null if none yet */
export async function getQuizInput(): Promise<QuizInput | null> {
  const all = await getQuizResults();
  const latest = all.length ? all[all.length - 1] : null;
  if (!latest) return null;
  const answers: Record<string, number> = {};
  QUESTIONS.forEach((q, i) => {
    answers[q.id] = latest.answers[i] ?? 3;
  });
  return { score: latest.score, sub: latest.sub, answers };
}

/** Latest AI scan (Plus users only; free users get null) */
export async function getScanInput(): Promise<ScanInput> {
  try {
    const scans = await fetchScans();
    const s = scans.length ? scans[scans.length - 1] : null;
    return s
      ? {
          overall: s.overall,
          density: s.density,
          scalp_coverage: s.scalp_coverage,
        }
      : null;
  } catch {
    return null;
  }
}
