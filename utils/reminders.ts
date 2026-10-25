// utils/reminders.ts
// Local (on-device) reminders. No server needed.
// - "smart" mode learns the time of day you usually finish a session and reminds you then
// - "fixed" mode uses a time you choose
// A reminder is only scheduled for days you haven't done a session yet. We schedule the next
// 7 days and refresh the schedule every time the app opens or a session finishes.
// With a two-session plan (Plus), there are two reminders a day, 12 hours apart, and each one is skipped
// if you already did a session around that time.
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getSessions } from "@/utils/storage";
import { toLocalDateISO } from "@/utils/date";
import { Session } from "@/types";
import { requestSync } from "@/utils/syncSignal";
import { getPlan } from "@/utils/planStore";
import { currentWeek, type Plan } from "@/utils/planBuilder";
import { focusForSession, sessionsSince } from "@/utils/sessionGuide";

export const REMINDER_KEY = "@hair_massage/reminder_settings";
const KEY = REMINDER_KEY;
const ID_PREFIX = "hm-reminder-";
const CHANNEL_ID = "reminders";

const DAYS_AHEAD = 7;
const HABIT_WINDOW_DAYS = 21; // look at the last 3 weeks of sessions
const MIN_SESSIONS_FOR_HABIT = 3; // need at least this many to call it a habit
const MIN_CONSISTENCY = 0.35; // 0 = all over the day, 1 = always the same time
const SMART_OFFSET_MIN = -15; // remind a little before the usual finish time
const SESSION_WINDOW_MIN = 360; // a session within 6 hours of a reminder counts as "done" for that reminder

export type ReminderSettings = {
  enabled: boolean;
  mode: "smart" | "fixed";
  fixedMinutes: number; // minutes after midnight, e.g. 20 * 60 = 8:00 PM
};

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  mode: "smart",
  fixedMinutes: 20 * 60,
};

// Show the notification even if the app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const MESSAGES = [
  {
    title: "Time for your scalp massage",
    body: "A few minutes today keeps your routine going.",
  },
  {
    title: "Your scalp is waiting 💆",
    body: "Take a short session and log how you feel.",
  },
  {
    title: "Keep your streak going",
    body: "You haven't done a session today yet.",
  },
  {
    title: "Quick reset",
    body: "Even a short massage counts. Open Growmo to start.",
  },
  {
    title: "Gentle reminder",
    body: "Today's massage isn't done yet. Ready when you are.",
  },
];

export async function getReminderSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_REMINDER, ...JSON.parse(raw) } : DEFAULT_REMINDER;
  } catch {
    return DEFAULT_REMINDER;
  }
}

// Used by the cloud sync when it copies settings down (doesn't trigger another sync)
export async function applyReminderSettings(
  s: ReminderSettings,
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function saveReminderSettings(s: ReminderSettings): Promise<void> {
  await applyReminderSettings(s);
  requestSync();
}

/**
 * Finds the time of day you usually finish a session.
 * Uses a circular average so 11:50 PM and 12:10 AM average to midnight, not noon.
 * Returns null if there are too few sessions or the times are all over the place.
 */
export function computeUsualMinutes(
  sessions: Session[],
): { minutes: number; basedOn: number } | null {
  const cutoff = Date.now() - HABIT_WINDOW_DAYS * 86400000;
  const recent = sessions.filter((s) => s.timestamp >= cutoff);
  if (recent.length < MIN_SESSIONS_FOR_HABIT) return null;

  let x = 0;
  let y = 0;
  for (const s of recent) {
    const d = new Date(s.timestamp);
    const minutes = d.getHours() * 60 + d.getMinutes();
    const angle = (minutes / 1440) * 2 * Math.PI;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  x /= recent.length;
  y /= recent.length;

  if (Math.hypot(x, y) < MIN_CONSISTENCY) return null; // no clear habit

  let angle = Math.atan2(y, x);
  if (angle < 0) angle += 2 * Math.PI;
  const raw = (angle / (2 * Math.PI)) * 1440;
  const rounded = (Math.round(raw / 15) * 15) % 1440; // nearest 15 minutes
  return { minutes: rounded, basedOn: recent.length };
}

export function reminderMinutes(
  s: ReminderSettings,
  sessions: Session[],
): { minutes: number; source: "habit" | "fixed" } {
  if (s.mode === "smart") {
    const usual = computeUsualMinutes(sessions);
    if (usual) {
      return {
        minutes: (usual.minutes + SMART_OFFSET_MIN + 1440) % 1440,
        source: "habit",
      };
    }
  }
  return { minutes: s.fixedMinutes, source: "fixed" };
}

export function formatTimeOfDay(minutes: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain === false) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

async function cancelReminders() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

// ---------------------------------------------------- two sessions a day
/** The saved plan, if this week of it has two sessions a day. null otherwise (one reminder a day as before). */
async function twoSessionPlan(): Promise<Plan | null> {
  try {
    const plan = await getPlan();
    if (!plan || !plan.program) return null;
    const week = plan.weeks[currentWeek(plan) - 1];
    return week && week.sessionsPerDay === 2 ? plan : null;
  } catch {
    return null;
  }
}

/** Did you already do a session today close to this reminder's time of day? */
function sessionNear(
  sessions: Session[],
  dayISO: string,
  reminderMin: number,
): boolean {
  return sessions.some((s) => {
    if (s.dateISO !== dayISO) return false;
    const d = new Date(s.timestamp);
    const m = d.getHours() * 60 + d.getMinutes();
    const diff = Math.abs(m - reminderMin);
    return Math.min(diff, 1440 - diff) < SESSION_WINDOW_MIN;
  });
}

function twoSessionMessage(
  plan: Plan,
  when: Date,
  sessionsAhead: number,
  sessionsDone: number,
) {
  // The next session is the next area in the rotation; each later reminder is one step further on
  const focus = focusForSession(
    sessionsDone + sessionsAhead,
    plan.program.rotation,
  );
  const word =
    when.getHours() < plan.program.morningUntilHour ? "morning" : "evening";
  return {
    title: `Time for your ${word} session`,
    body: `Today's focus: ${plan.program.zoneLabels[focus]}. A few minutes keeps your routine going.`,
  };
}

/** Rebuilds the next 7 days of reminders. Safe to call as often as you like. */
export async function rescheduleReminders(): Promise<void> {
  try {
    await cancelReminders();

    const settings = await getReminderSettings();
    if (!settings.enabled) return;

    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Daily reminders",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const sessions = await getSessions();
    const { minutes } = reminderMinutes(settings, sessions);
    // A two-session plan gets a second reminder 12 hours after the first
    const plan = await twoSessionPlan();
    const times = plan
      ? [minutes, (minutes + 720) % 1440].sort((a, b) => a - b)
      : [minutes];

    const now = new Date();
    const todayISO = toLocalDateISO(now);
    const doneToday = sessions.some((s) => s.dateISO === todayISO);
    const sessionsDone = plan ? sessionsSince(sessions, plan.createdAt) : 0;
    let ahead = 0; // reminders scheduled so far: each one is another session in the rotation

    for (let i = 0; i < DAYS_AHEAD; i++) {
      for (let slot = 0; slot < times.length; slot++) {
        const t = times[slot];
        const when = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + i,
          Math.floor(t / 60),
          t % 60,
          0,
          0,
        );
        if (when.getTime() <= Date.now() + 60_000) continue; // time already passed
        if (i === 0 && (plan ? sessionNear(sessions, todayISO, t) : doneToday))
          continue; // already done: no nudge

        const msg = plan
          ? twoSessionMessage(plan, when, ahead++, sessionsDone)
          : MESSAGES[(when.getDate() + i) % MESSAGES.length];
        await Notifications.scheduleNotificationAsync({
          identifier: `${ID_PREFIX}${toLocalDateISO(when)}${plan ? `-${slot}` : ""}`,
          content: { title: msg.title, body: msg.body },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: when,
            channelId: CHANNEL_ID,
          },
        });
      }
    }
  } catch {
    // Reminders are a nice-to-have; never crash the app because of them
  }
}
