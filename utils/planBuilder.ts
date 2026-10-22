// utils/planBuilder.ts
// Turns a person's answers into a 12-week massage program (three scalp areas, taking turns). Pure logic: no storage, no screens.
// Every number and sentence comes from data/planConfig.json, so you can change the plans by editing that file.
// This is a habit plan, not a treatment. Nothing in here claims to cure or treat hair loss.

// ---------------------------------------------------------------- types
export type ThinningArea = "none" | "front" | "crown" | "diffuse" | "patchy";
export type ScalpState = "comfortable" | "sensitive" | "problem";
export type Level = "L1" | "L2" | "L3" | "L4";
export type ZoneId = "hairline" | "vertex" | "sides";
export type PhaseId = "warmup" | "pinch" | "press" | "stretch" | "ridge";

/** Everything a session needs to know about the program, copied from the config when the plan is built. */
export type ProgramInfo = {
  phases: Record<PhaseId, { label: string; text: string }>;
  /** Relative time per phase for one session. "sides" adds the ridge pinch. */
  split: { standard: Partial<Record<PhaseId, number>>; sides: Partial<Record<PhaseId, number>> };
  zoneLabels: Record<ZoneId, string>;
  zoneShort: Record<ZoneId, string>;
  /** Order the scalp areas take their turns in */
  rotation: ZoneId[];
  /** Sessions started before this hour (local time) count as the morning slot */
  morningUntilHour: number;
  rotationNote: string;
};

export type PlanIntake = {
  thinningArea: ThinningArea; // "Where do you notice thinning?"
  scalpState: ScalpState; // "How does your scalp feel?"
  shedCheckedByDoctor: boolean; // "Have you had your shedding checked by a doctor?"
  minutesAvailable: 5 | 10 | 15 | 20; // longest single session the person is happy with (two sessions a day)
};

export type QuizInput = {
  score: number; // 0-100
  sub: { shedding: number; scalp: number; condition: number; lifestyle: number }; // 0-100 each
  // points for each question id: 3 = best answer ... 0 = worst
  answers: Record<string, number>;
};

export type ScanInput = {
  overall: number; // 0-10
  density: number;
  scalp_coverage: number;
} | null;

export type ProfileId =
  | "heavy_shedding"
  | "pattern"
  | "diffuse"
  | "scalp_comfort"
  | "condition"
  | "stress_sleep"
  | "maintenance";

export type TaskType = "checkup" | "review" | "quiz" | "photo" | "habit" | "checkin" | "shedding_check";

export type PlanTask = { id: string; type: TaskType; text: string };

export type WeekPlan = {
  week: number;
  phase: "foundation" | "build" | "sustain";
  level: Level;
  minutesPerSession: number;
  minutesPerDay: number; // minutesPerSession x sessionsPerDay
  daysPerWeek: number;
  recommendedDays?: number; // what the plan suggested before the person adjusted it
  sessionsPerDay: 1 | 2;
  press: boolean; // whether pressing is part of this week's sessions
  pressNote?: string; // shown when pressing is left out or starts later
  techniques: string[];
  tasks: PlanTask[];
  milestone?: string;
};

export type Plan = {
  configVersion: number;
  createdAt: string; // ISO
  profile: ProfileId;
  tags: string[]; // extra factors found, e.g. "sensitive", "lifestyle", "nutrition"
  title: string;
  summary: string;
  expectation: string;
  preferredTime: "evening" | "any";
  pressureRule: string;
  safetyNotes: string[];
  program: ProgramInfo;
  intake: PlanIntake;
  targetLevel: Level;
  daysOverride?: number; // set when the person chose their own days per week
  weeks: WeekPlan[];
};

export type BuildResult =
  | { kind: "plan"; plan: Plan }
  | { kind: "doctor_first"; reason: "patchy" | "problem"; title: string; body: string };

type Config = any; // shape of data/planConfig.json

// ------------------------------------------------------------- helpers
const LEVEL_ORDER: Level[] = ["L1", "L2", "L3", "L4"];
const levelIndex = (l: Level) => LEVEL_ORDER.indexOf(l);
const minLevel = (a: Level, b: Level): Level => (levelIndex(a) <= levelIndex(b) ? a : b);

function phaseFor(week: number): WeekPlan["phase"] {
  return week <= 2 ? "foundation" : week <= 6 ? "build" : "sustain";
}

// ------------------------------------------------------ choose profile
export function chooseProfile(
  quiz: QuizInput,
  intake: PlanIntake,
): { profile: ProfileId; tags: string[] } {
  const shed = quiz.answers["shedding"] ?? 3; // 0 = "a lot more than usual"
  const heavy = shed === 0;
  const elevatedShedding = shed <= 1;
  const tags: string[] = [];

  if (intake.scalpState === "sensitive" || quiz.sub.scalp < 50) tags.push("sensitive");
  if (quiz.sub.lifestyle < 50) tags.push("lifestyle");
  if (quiz.sub.condition < 50) tags.push("condition");
  if ((quiz.answers["diet"] ?? 3) <= 1 || quiz.sub.shedding < 60) tags.push("nutrition");
  if (elevatedShedding) tags.push("elevated_shedding");

  let profile: ProfileId;
  if (heavy) profile = "heavy_shedding";
  else if (intake.thinningArea === "front" || intake.thinningArea === "crown") profile = "pattern";
  else if (intake.thinningArea === "diffuse") profile = "diffuse";
  else if (tags.includes("sensitive")) profile = "scalp_comfort";
  else if (tags.includes("condition")) profile = "condition";
  else if (tags.includes("lifestyle")) profile = "stress_sleep";
  else profile = "maintenance";

  // The profile itself shouldn't repeat as a tag
  const dedupe: Record<string, string> = { scalp_comfort: "sensitive", condition: "condition", stress_sleep: "lifestyle" };
  return { profile, tags: tags.filter((t) => t !== dedupe[profile]) };
}

// ------------------------------------------------------------- program
/** Heavy shedding or a sensitive scalp: no pressing, only warm-up, pinching and stretching. */
export function noPressFor(profile: ProfileId, tags: string[]): boolean {
  return tags.includes("sensitive") || profile === "scalp_comfort" || profile === "heavy_shedding";
}

function programFrom(config: Config): ProgramInfo {
  const p = config.program;
  return {
    phases: p.phases,
    split: p.split,
    zoneLabels: config.zones,
    zoneShort: config.zoneShort,
    rotation: p.rotation,
    morningUntilHour: p.morningUntilHour,
    rotationNote: p.rotationNote,
  };
}

// ------------------------------------------------------- week schedule
function levelForWeek(config: Config, week: number, target: Level, delayWeeks: number): Level {
  const eff = Math.max(1, week - delayWeeks); // sensitive scalps start the ramp later
  const r = config.ramp;
  if (week <= 2 + delayWeeks && delayWeeks > 0) return "L1";
  let step: string;
  if (eff <= 2) step = r.weeks1to2;
  else if (eff <= 4) step = r.weeks3to4;
  else if (eff <= 6) step = r.weeks5to6;
  else step = r.weeks7to12;
  const wanted: Level = step === "target" ? target : (step as Level);
  return minLevel(wanted, target);
}

function massageFor(
  config: Config,
  level: Level,
  intake: PlanIntake,
  sensitive: boolean,
  noPress: boolean,
  week: number,
  daysCap: number,
  daysOverride?: number,
): Pick<
  WeekPlan,
  | "level"
  | "minutesPerSession"
  | "minutesPerDay"
  | "daysPerWeek"
  | "recommendedDays"
  | "sessionsPerDay"
  | "press"
  | "pressNote"
  | "techniques"
> {
  const lv = config.levels[level];
  // minutesAvailable is the longest session the person is happy with
  const minutes = Math.min(lv.minutes, intake.minutesAvailable, config.maxMinutesPerSession);
  const sessionsPerDay: 1 | 2 = config.program.sessionsPerDay === 1 ? 1 : 2;
  const recommendedDays = Math.max(3, Math.min(lv.days, daysCap));
  const days = daysOverride ?? recommendedDays;

  const pressFromWeek: number = config.program.pressFromWeek;
  const press = !noPress && week >= pressFromWeek;
  const pressNote = noPress
    ? String(config.program.pressNotes.leftOut)
    : week < pressFromWeek
      ? String(config.program.pressNotes.later).replace("{week}", String(pressFromWeek))
      : undefined;

  const techniques: string[] = sensitive
    ? config.techniques.sensitive
    : week <= 2
      ? config.techniques.weeks1to2
      : week <= 4
        ? config.techniques.weeks3to4
        : config.techniques.weeks5to12;
  return {
    level,
    minutesPerSession: minutes,
    minutesPerDay: minutes * sessionsPerDay,
    daysPerWeek: days,
    recommendedDays,
    sessionsPerDay,
    press,
    pressNote,
    techniques,
  };
}

// ----------------------------------------------------------- tasks
const TYPE_PRIORITY: Record<TaskType, number> = {
  checkup: 1,
  review: 2,
  quiz: 2,
  photo: 3,
  habit: 4,
  checkin: 5,
  shedding_check: 99, // one-tap question, not counted toward the weekly limit
};

function tasksForWeek(config: Config, week: number, profile: ProfileId, tags: string[], needsCheckup: boolean): PlanTask[] {
  const t = config.tasks;
  const all: PlanTask[] = [];

  if (needsCheckup && week === 1) all.push({ id: `w${week}-checkup`, type: "checkup", text: t.checkup });
  if (profile === "heavy_shedding" && week === 12) {
    all.push({ id: `w${week}-recheck`, type: "checkup", text: t.checkupRecheck });
  }
  if (config.quizWeeks.includes(week)) all.push({ id: `w${week}-quiz`, type: "quiz", text: t.quiz });
  if (config.photoWeeks.includes(week)) all.push({ id: `w${week}-photo`, type: "photo", text: t.photo });
  if (config.checkinWeeks.includes(week)) all.push({ id: `w${week}-checkin`, type: "checkin", text: t.checkin });

  const applies = (for_: string[]) =>
    for_.includes("*") || for_.includes(profile) || for_.some((f) => tags.includes(f));
  config.habits
    .filter((h: any) => h.week === week && applies(h.for))
    .forEach((h: any) => all.push({ id: `w${week}-habit`, type: "habit", text: h.text }));

  const sorted = all.sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type]);
  const limited = sorted.slice(0, config.maxTasksPerWeek);

  if (config.sheddingCheckProfiles.includes(profile)) {
    limited.push({ id: `w${week}-shedding`, type: "shedding_check", text: t.sheddingCheck });
  }
  return limited;
}

// ----------------------------------------------------------- build plan
export function buildPlan(
  config: Config,
  quiz: QuizInput,
  scan: ScanInput,
  intake: PlanIntake,
  now: Date = new Date(),
): BuildResult {
  // Gates: no massage plan until a doctor has looked at these
  if (intake.thinningArea === "patchy") return { kind: "doctor_first", reason: "patchy", ...config.gates.patchy };
  if (intake.scalpState === "problem") return { kind: "doctor_first", reason: "problem", ...config.gates.problem };

  const { profile, tags } = chooseProfile(quiz, intake);
  const pc = config.profiles[profile];
  const sensitive = tags.includes("sensitive") || profile === "scalp_comfort";
  const target: Level = sensitive ? minLevel(pc.targetLevel, "L2") : pc.targetLevel;
  const delay = sensitive ? config.ramp.sensitiveDelayWeeks : 0;

  // Who gets a "get a check-up" task in week 1
  const lowScan = scan != null && scan.overall <= 3;
  const needsCheckup =
    !intake.shedCheckedByDoctor &&
    (profile === "heavy_shedding" || tags.includes("elevated_shedding") || quiz.score < 35 || lowScan);

  const noPress = noPressFor(profile, tags);
  const weeks: WeekPlan[] = [];
  for (let week = 1; week <= config.planWeeks; week++) {
    const level = levelForWeek(config, week, target, delay);
    weeks.push({
      week,
      phase: phaseFor(week),
      ...massageFor(config, level, intake, sensitive, noPress, week, pc.daysCap),
      tasks: tasksForWeek(config, week, profile, tags, needsCheckup),
      milestone: config.milestones[String(week)],
    });
  }

  return {
    kind: "plan",
    plan: {
      configVersion: config.version,
      createdAt: now.toISOString(),
      profile,
      tags,
      title: pc.title,
      summary: pc.summary,
      expectation: pc.expectation,
      preferredTime: pc.preferredTime,
      pressureRule: config.pressureRule,
      safetyNotes: config.safetyNotes,
      program: programFrom(config),
      intake,
      targetLevel: target,
      weeks,
    },
  };
}

// ------------------------------------------------------------ progress
export function currentWeek(plan: Plan, now: Date = new Date()): number {
  const days = Math.floor((now.getTime() - new Date(plan.createdAt).getTime()) / 86400000);
  return Math.min(plan.weeks.length, Math.max(1, Math.floor(days / 7) + 1));
}

export function weekDateRange(plan: Plan, week: number): { start: Date; end: Date } {
  const start = new Date(plan.createdAt);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** How many different days in the given week had at least one session */
export function daysDoneInWeek(plan: Plan, week: number, sessionTimestamps: number[]): number {
  const { start, end } = weekDateRange(plan, week);
  const days = new Set<string>();
  sessionTimestamps.forEach((ts) => {
    if (ts >= start.getTime() && ts < end.getTime()) days.add(new Date(ts).toDateString());
  });
  return days.size;
}

// -------------------------------------------------------------- review
export type ReviewAction = "keep" | "simplify" | "step_up" | "gentle_reset";

export type ReviewResult = {
  action: ReviewAction;
  adherence: number; // 0-1 over the last (up to) 4 completed weeks
  message: string;
};

export function reviewPlan(
  config: Config,
  plan: Plan,
  sessionTimestamps: number[],
  sheddingAnswers: Record<number, "less" | "same" | "more">,
  irritationReported: boolean,
  now: Date = new Date(),
): ReviewResult {
  const cw = currentWeek(plan, now);
  const completed = Array.from({ length: cw - 1 }, (_, i) => i + 1).slice(-4);
  let planned = 0;
  let done = 0;
  completed.forEach((w) => {
    const target = plan.weeks[w - 1].daysPerWeek;
    planned += target;
    done += Math.min(target, daysDoneInWeek(plan, w, sessionTimestamps));
  });
  const adherence = planned === 0 ? 0 : done / planned;

  const lastTwo = completed.slice(-2);
  const moreShedding = lastTwo.length === 2 && lastTwo.every((w) => sheddingAnswers[w] === "more");

  if (irritationReported || moreShedding) {
    return {
      action: "gentle_reset",
      adherence,
      message: irritationReported
        ? "Your scalp felt irritated, so let's go back to short, light sessions for two weeks. If it doesn't settle, please see a doctor."
        : "You've told us shedding has been higher for two weeks in a row. We'll drop back to short, light sessions, and we'd suggest talking to a doctor and sharing your progress report.",
    };
  }
  if (completed.length > 0 && adherence < config.review.simplifyBelow) {
    return {
      action: "simplify",
      adherence,
      message: "Life gets busy. Let's make the plan easier so it's something you can keep up: fewer days and shorter sessions. A smaller habit you keep beats a bigger one you drop.",
    };
  }
  const stepTo = config.profiles[plan.profile].stepUpTo as Level | null;
  if (
    completed.length >= 2 &&
    adherence >= config.review.stepUpAtOrAbove &&
    stepTo &&
    levelIndex(plan.targetLevel) < levelIndex(stepTo) &&
    plan.intake.scalpState === "comfortable" &&
    plan.intake.minutesAvailable >= config.levels[stepTo].minutes
  ) {
    return {
      action: "step_up",
      adherence,
      message: "You've been very consistent. If your scalp feels comfortable, you can move up to longer sessions for the rest of your plan.",
    };
  }
  return {
    action: "keep",
    adherence,
    message: completed.length === 0
      ? "Your first review appears after your first full week."
      : "You're on track. Keep going and judge your progress using your photos and scores, not day-to-day changes.",
  };
}

/** Changes the weeks from fromWeek onwards. Returns a new plan. */
export function applyReview(config: Config, plan: Plan, action: ReviewAction, fromWeek: number): Plan {
  if (action === "keep") return plan;
  const sensitive = plan.tags.includes("sensitive") || plan.profile === "scalp_comfort";
  const pc = config.profiles[plan.profile];
  const noPress = noPressFor(plan.profile, plan.tags);

  let targetLevel = plan.targetLevel;
  if (action === "step_up" && pc.stepUpTo) targetLevel = pc.stepUpTo as Level;

  // If the person picked their own days per week, keep it, except when the plan is easing off
  let daysOverride = plan.daysOverride;
  if (action === "gentle_reset") daysOverride = undefined;
  if (action === "simplify" && daysOverride != null) {
    daysOverride = Math.max(config.review.minDaysAfterSimplify, daysOverride - 2);
  }

  const weeks = plan.weeks.map((w) => {
    if (w.week < fromWeek) return w;
    let level: Level = w.level;
    let daysCap = pc.daysCap;
    if (action === "step_up") level = minLevel(targetLevel, levelForWeek(config, w.week, targetLevel, 0));
    if (action === "gentle_reset") level = w.week < fromWeek + 2 ? "L1" : minLevel(w.level, "L2");
    if (action === "simplify") {
      level = LEVEL_ORDER[Math.max(0, levelIndex(w.level) - 1)];
      daysCap = Math.max(config.review.minDaysAfterSimplify, w.daysPerWeek - 2);
    }
    const m = massageFor(config, level, plan.intake, sensitive, noPress, w.week, daysCap, daysOverride);
    return { ...w, ...m };
  });
  return { ...plan, targetLevel, daysOverride, weeks };
}

// ----------------------------------------------------- adjust days per week
/** The most days a person can choose: 6 normally, lower for heavy shedding or a sensitive scalp */
export function maxAdjustableDays(config: Config, plan: Plan): number {
  const cap = config.profiles[plan.profile].daysCap as number;
  const sensitive = plan.tags.includes("sensitive") || plan.profile === "scalp_comfort";
  const limited = sensitive || plan.profile === "heavy_shedding";
  return limited ? Math.min(config.adjust.maxDays, cap) : config.adjust.maxDays;
}

/** Sets the days per week from fromWeek onwards. Minutes, areas and tasks stay as they are. */
export function setWeeklyDays(config: Config, plan: Plan, days: number, fromWeek: number): Plan {
  const d = Math.max(config.adjust.minDays, Math.min(maxAdjustableDays(config, plan), Math.round(days)));
  const weeks = plan.weeks.map((w) => (w.week < fromWeek ? w : { ...w, daysPerWeek: d }));
  return { ...plan, daysOverride: d, weeks };
}

/** Goes back to the plan's own suggested days from fromWeek onwards */
export function resetWeeklyDays(plan: Plan, fromWeek: number): Plan {
  const weeks = plan.weeks.map((w) =>
    w.week < fromWeek ? w : { ...w, daysPerWeek: w.recommendedDays ?? w.daysPerWeek },
  );
  return { ...plan, daysOverride: undefined, weeks };
}