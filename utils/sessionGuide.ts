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

  const base = {
    ...(focus === "sides" ? program.split.sides : program.split.standard),
  } as Partial<Record<PhaseId, number>>;
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
        zone: (isWarmup ? "all" : phase === "ridge" ? "sides" : focus) as
          ZoneId | "all",
        phase,
        label: isWarmup
          ? `${info.label}, whole scalp`
          : `${info.label}, ${short}`,
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
/** How many sessions were finished since the plan was made. */
export function sessionsSince(
  sessions: { timestamp: number }[],
  since: string | Date,
): number {
  const start = new Date(since).getTime();
  return sessions.filter((s) => s.timestamp >= start).length;
}

/**
 * Which scalp area is up next. The areas take turns, one per finished session, in the order of the rotation
 * (hairline, vertex, sides, and round again). With two sessions a day that gives each area 36 hours to rest,
 * as in the original program: day 1 hairline then vertex, day 2 sides then hairline, day 3 vertex then sides.
 * Because it counts finished sessions, a second session the same morning moves on to the next area.
 */
export function focusForSession(
  sessionsDone: number,
  rotation: ZoneId[],
): ZoneId {
  const n = rotation.length;
  return rotation[((sessionsDone % n) + n) % n];
}
