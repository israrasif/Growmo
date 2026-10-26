// utils/analytics.ts
// Simple funnel tracking into your own database (table analytics_events). No extra service or app permission.
// Events are queued on the phone and sent in batches, so being offline never loses them or slows the app.
//
// RULES: send screen ids and counts only. NEVER send answers, scores, photos, names or anything about hair or health.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "@/utils/supabase";

const QUEUE_KEY = "@hair_massage/analytics_queue";
const MAX_QUEUE = 100;
const BATCH = 50;

type Props = Record<string, string | number | boolean | null | undefined>;
type QueuedEvent = {
  name: string;
  props: Record<string, string | number | boolean | null>;
  created_at: string;
};

let queue: QueuedEvent[] | null = null;
let flushing = false;

async function loadQueue(): Promise<QueuedEvent[]> {
  if (queue) return queue;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    queue = raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    queue = [];
  }
  return queue;
}

async function saveQueue() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue ?? []));
  } catch {
    // ignore
  }
}

function clean(props: Props): QueuedEvent["props"] {
  const out: QueuedEvent["props"] = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) continue;
    out[k.slice(0, 40)] = typeof v === "string" ? v.slice(0, 64) : v;
  }
  return out;
}

/** Sends whatever is waiting. Safe to call any time; it does nothing when signed out or already running. */
export async function flushEvents(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const q = await loadQueue();
    while (q.length > 0) {
      const batch = q.slice(0, BATCH);
      const { error } = await supabase.from("analytics_events").insert(
        batch.map((e) => ({
          name: e.name,
          props: e.props,
          created_at: e.created_at,
          app_version: Constants.expoConfig?.version ?? null,
          platform: Platform.OS,
        })),
      );
      if (error) return; // try again next time
      q.splice(0, batch.length);
      await saveQueue();
    }
  } catch {
    // offline or a hiccup: the events stay queued
  } finally {
    flushing = false;
  }
}

/** Record that something happened. Returns at once; sending happens in the background. */
export function track(name: string, props: Props = {}): void {
  (async () => {
    const q = await loadQueue();
    q.push({
      name: name.slice(0, 64),
      props: clean(props),
      created_at: new Date().toISOString(),
    });
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
    await saveQueue();
    flushEvents();
  })().catch(() => {});
}

import { Session } from "@/types";
import { toLocalDateISO, daysAgoISO } from "@/utils/date";

function toDateOnly(iso: string) {
  return iso.slice(0, 10);
}

export function computeStreak(sessions: Session[]): {
  current: number;
  longest: number;
  totalDays: number;
} {
  const uniqueDays = Array.from(
    new Set(sessions.map((s) => toDateOnly(s.dateISO))),
  ).sort();
  if (uniqueDays.length === 0) return { current: 0, longest: 0, totalDays: 0 };

  // "YYYY-MM-DD" strings parse as UTC midnight, so the difference between
  // two of them is always a whole number of days (no DST or timezone effects).
  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const diffDays = Math.round(
      (Date.parse(uniqueDays[i]) - Date.parse(uniqueDays[i - 1])) /
        (1000 * 60 * 60 * 24),
    );
    if (diffDays === 1) {
      run += 1;
    } else if (diffDays > 1) {
      longest = Math.max(longest, run);
      run = 1;
    }
  }
  longest = Math.max(longest, run);

  // current streak: walk backward from today (local date)
  const daySet = new Set(uniqueDays);
  let current = 0;
  while (daySet.has(daysAgoISO(current))) {
    current += 1;
  }

  return { current, longest, totalDays: uniqueDays.length };
}

export function last7DaysCounts(
  sessions: Session[],
): { label: string; count: number }[] {
  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const result: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = toLocalDateISO(d);
    const count = sessions.filter((s) => toDateOnly(s.dateISO) === iso).length;
    result.push({ label: dayLabels[d.getDay()], count });
  }
  return result;
}

export function consistencyScore(sessions: Session[]): number {
  // % of last 14 days with at least one session
  const daySet = new Set(sessions.map((s) => toDateOnly(s.dateISO)));
  let hit = 0;
  for (let i = 0; i < 14; i++) {
    if (daySet.has(daysAgoISO(i))) hit += 1;
  }
  return Math.round((hit / 14) * 100);
}

export function activityFrequency(sessions: Session[]): Record<string, number> {
  const freq: Record<string, number> = {};
  sessions.forEach((s) => {
    s.activities.forEach((a) => {
      freq[a] = (freq[a] || 0) + 1;
    });
  });
  return freq;
}
