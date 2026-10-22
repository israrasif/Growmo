// utils/sessionGuide.ts
// Turns one session into a timed list of steps (warm-up, pinch, press, stretch) for ONE scalp area,
// and works out which area is up next in the three-area rotation.
// Pure logic: no storage, no screens.
import type { PhaseId, ProgramInfo, ZoneId } from "@/utils/planBuilder";

export type GuideSegment = {
  /** Unique within a session (the same area appears in several steps) */
  id: string;
  /** Which part of the head to light up. The warm-up covers the whole scalp. */
  zone: ZoneId | "all";
  phase: PhaseId;
  /** Short name, also read out loud: for example "Pinch, hairline" */
  label: string;
  /** How to do this step */
  text: string;
  seconds: number;
};

const PHASE_ORDER: PhaseId[] = ["warmup", "pinch", "press", "stretch", "ridge"];

/**
 * Builds the steps for one session on the given area. The relative timing comes from the plan's program
 * (3 / 6 / 6 / 5 minutes for a 20-minute session, plus a 5-minute ridge pinch on the sides) and is scaled
 * to fit durationSec exactly, so it works for any session length. With press = false the pressing time is
 * shared between pinching and stretching.
 */
export function buildGuide(
  focus: ZoneId,
  durationSec: number,
  program: ProgramInfo,
  press: boolean,
): GuideSegment[] {
  if (durationSec <= 0) return [];

  const base = { ...(focus === "sides" ? program.split.sides : program.split.standard) } as Partial<Record<PhaseId, number>>;
  if (!press && base.press) {
    const share = base.press / 2;
    base.pinch = (base.pinch ?? 0) + share;
    base.stretch = (base.stretch ?? 0) + share;
    delete base.press;
  }

  const phases = PHASE_ORDER.filter((p) => (base[p] ?? 0) > 0);
  const total = phases.reduce((s, p) => s + (base[p] ?? 0), 0);
  if (phases.length === 0 || total <= 0) return [];

  const short = program.zoneShort[focus];
  let used = 0;
  return phases
    .map((phase, i) => {
      const seconds =
        i === phases.length - 1
          ? durationSec - used
          : Math.round((durationSec * (base[phase] ?? 0)) / total);
      used += seconds;
      const info = program.phases[phase];
      const isWarmup = phase === "warmup";
      return {
        id: `${phase}-${i}`,
        zone: (isWarmup ? "all" : phase === "ridge" ? "sides" : focus) as ZoneId | "all",
        phase,
        label: isWarmup ? `${info.label}, whole scalp` : `${info.label}, ${short}`,
        text: info.text,
        seconds,
      };
    })
    .filter((s) => s.seconds > 0);
}

/** Which step you should be on after elapsedSec seconds, and how long is left in it */
export function segmentInfo(
  segments: GuideSegment[],
  elapsedSec: number,
): { index: number; secondsLeft: number } {
  let start = 0;
  for (let i = 0; i < segments.length; i++) {
    const end = start + segments[i].seconds;
    if (elapsedSec < end) return { index: i, secondsLeft: end - elapsedSec };
    start = end;
  }
  const last = segments.length - 1;
  return { index: Math.max(0, last), secondsLeft: 0 };
}

// ------------------------------------------------------------ rotation
const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Which scalp area is up for this session. Two slots a day (morning and evening) step through the three
 * areas in order, so with two sessions a day each area is worked once every 36 hours:
 * day 1 hairline then vertex, day 2 sides then hairline, day 3 vertex then sides, and so on.
 * Based only on the date and time of day, so skipping a session never breaks the rotation.
 */
export function focusForNow(
  planStart: string | Date,
  now: Date,
  morningUntilHour: number,
  rotation: ZoneId[],
): ZoneId {
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(new Date(planStart))) / 86400000);
  const slot = now.getHours() < morningUntilHour ? 0 : 1;
  const index = (((Math.max(0, days) * 2 + slot) % rotation.length) + rotation.length) % rotation.length;
  return rotation[index];
}