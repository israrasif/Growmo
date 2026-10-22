// utils/useSessionGuide.ts
// Works out whether the timer should guide this session step by step, and how.
// Guided sessions (the three-area program) are a Plus feature. Free users get the plain timer.
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasPlus, usePlan } from "@/utils/entitlements";
import { getPlan } from "@/utils/planStore";
import { currentWeek, type Plan, type WeekPlan, type ZoneId } from "@/utils/planBuilder";
import { buildGuide, focusForNow, type GuideSegment } from "@/utils/sessionGuide";

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
  /** The scalp area for this session (changes with the time of day) */
  focus: ZoneId | null;
  guideOn: boolean;
  voiceOn: boolean;
  setGuideOn: (v: boolean) => void;
  setVoiceOn: (v: boolean) => void;
  /** Present only when guidance is available and switched on */
  segments: GuideSegment[] | undefined;
  /** The steps shown in the card even when the switch is off */
  preview: GuideSegment[];
};

export function useSessionGuide(durationSec: number): SessionGuide {
  const isPlus = hasPlus(usePlan());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [guideOn, setGuideOnState] = useState(true);
  const [voiceOn, setVoiceOnState] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setNow(new Date()); // the area depends on the time of day
      getPlan().then(setPlan);
      AsyncStorage.multiGet([GUIDE_KEY, VOICE_KEY]).then(([[, g], [, v]]) => {
        if (g != null) setGuideOnState(g === "1");
        if (v != null) setVoiceOnState(v === "1");
      });
    }, []),
  );

  const usablePlan = isPlus ? plan : null;
  const outdated = !!usablePlan && !usablePlan.program;
  const ready = usablePlan && !outdated ? usablePlan : null;

  const weekNumber = ready ? currentWeek(ready) : 0;
  const week = ready ? ready.weeks[weekNumber - 1] : null;
  const focus =
    ready && ready.program
      ? focusForNow(ready.createdAt, now, ready.program.morningUntilHour, ready.program.rotation)
      : null;

  const preview = useMemo(
    () => (ready && week && focus ? buildGuide(focus, durationSec, ready.program, week.press) : []),
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
  };
}