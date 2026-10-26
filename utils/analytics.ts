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
