// utils/useSessionGuide.ts
// Works out whether the timer should guide this session step by step, and how.
// Guided sessions (the three-area program) are a Plus feature. Free users get the plain timer.
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasPlus, usePlan } from "@/utils/entitlements";
import { getPlan } from "@/utils/planStore";
import { getSessions } from "@/utils/storage";
import { toLocalDateISO } from "@/utils/date";
import {
  currentWeek,
  type Plan,
  type WeekPlan,
  type ZoneId,
} from "@/utils/planBuilder";
import {
  buildGuide,
  focusForSession,
  sessionsSince,
  type GuideSegment,
} from "@/utils/sessionGuide";
import type { Session } from "@/types";

const GUIDE_KEY = "@hair_massage/guide_on";
const VOICE_KEY = "@hair_massage/voice_on";

export type SessionGuide = {
  isPlus: boolean;
  /** Always null for Free users */
  plan: Plan | null;
  week: WeekPlan | null;
  weekNumber: number;
  /** A saved plan from before the three-area program: it needs to be rebuilt */
  outdated: boolean;
  /** The scalp area for the next session. It moves on after every finished session. */
  focus: ZoneId | null;
  /** Sessions finished today */
  sessionsToday: number;
  guideOn: boolean;
  voiceOn: boolean;
  setGuideOn: (v: boolean) => void;
  setVoiceOn: (v: boolean) => void;
  /** Present only when guidance is available and switched on */
  segments: GuideSegment[] | undefined;
  /** The steps shown in the card even when the switch is off */
  preview: GuideSegment[];
  /** Call after a session is finished, so the next area shows up */
  refresh: () => Promise<void>;
};

export function useSessionGuide(durationSec: number): SessionGuide {
  const isPlus = hasPlus(usePlan());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [guideOn, setGuideOnState] = useState(true);
  const [voiceOn, setVoiceOnState] = useState(true);

  const refresh = useCallback(async () => {
    const [p, s] = await Promise.all([getPlan(), getSessions()]);
    setPlan(p);
    setSessions(s);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      AsyncStorage.multiGet([GUIDE_KEY, VOICE_KEY]).then(([[, g], [, v]]) => {
        if (g != null) setGuideOnState(g === "1");
        if (v != null) setVoiceOnState(v === "1");
      });
    }, [refresh]),
  );

  const usablePlan = isPlus ? plan : null;
  const outdated = !!usablePlan && !usablePlan.program;
  const ready = usablePlan && !outdated ? usablePlan : null;

  const weekNumber = ready ? currentWeek(ready) : 0;
  const week = ready ? ready.weeks[weekNumber - 1] : null;

  const sessionsDone = ready ? sessionsSince(sessions, ready.createdAt) : 0;
  const focus =
    ready && ready.program
      ? focusForSession(sessionsDone, ready.program.rotation)
      : null;

  const todayISO = toLocalDateISO(new Date());
  const sessionsToday = sessions.filter((s) => s.dateISO === todayISO).length;

  const preview = useMemo(
    () =>
      ready && week && focus
        ? buildGuide(focus, durationSec, ready.program, week.press)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, week, focus, durationSec],
  );

  return {
    isPlus,
    plan: usablePlan,
    week,
    weekNumber,
    outdated,
    focus,
    sessionsToday,
    guideOn,
    voiceOn,
    setGuideOn: (v) => {
      setGuideOnState(v);
      AsyncStorage.setItem(GUIDE_KEY, v ? "1" : "0");
    },
    setVoiceOn: (v) => {
      setVoiceOnState(v);
      AsyncStorage.setItem(VOICE_KEY, v ? "1" : "0");
    },
    segments: guideOn && preview.length > 0 ? preview : undefined,
    preview,
    refresh,
  };
}
