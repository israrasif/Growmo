import { QUESTIONS, type Answers } from '@/constants/onboardingQuestions';

export const PLAN_WEEKS = 12;

export type PlanSummary = {
  weeks: number;
  /** Option values: 'hairline' | 'vertex' | 'sides'. All three when the user said "all over" or skipped. */
  focusAreas: string[];
  sessionsPerDay: 1 | 2;
  timeOfDay: 'morning' | 'evening' | 'both';
  gentleStart: boolean;
  goals: string[];
};

const ALL_AREAS = ['hairline', 'vertex', 'sides'];

function labelFor(questionId: string, value: string): string {
  return QUESTIONS[questionId]?.options.find((o) => o.value === value)?.label ?? value;
}

/** Turns onboarding answers into the plan settings. Only answers that actually change something are used here. */
export function buildPlan(answers: Answers): PlanSummary {
  const areas = answers.areas ?? [];
  const focusAreas = areas.length === 0 || areas.includes('all_over') ? ALL_AREAS : areas;

  const when = (answers.when?.[0] as PlanSummary['timeOfDay'] | undefined) ?? 'both';

  return {
    weeks: PLAN_WEEKS,
    focusAreas,
    sessionsPerDay: when === 'both' ? 2 : 1,
    timeOfDay: when,
    gentleStart: answers.scalpFeel?.[0] === 'itchy_flaky',
    goals: answers.goal ?? [],
  };
}

/** Short, human-readable lines describing the plan. Reused by the pitch screen. */
export function planLines(plan: PlanSummary): string[] {
  const lines: string[] = [`${plan.weeks}-week plan`];

  if (plan.focusAreas.length === ALL_AREAS.length) {
    lines.push('All three scalp areas, in rotation');
  } else {
    const names = plan.focusAreas.map((v) => labelFor('areas', v).toLowerCase());
    lines.push(`Extra focus: ${names.join(' and ')}`);
  }

  lines.push(
    plan.sessionsPerDay === 2
      ? 'Two sessions a day, morning and evening'
      : `One session a day, in the ${plan.timeOfDay}`,
  );

  if (plan.gentleStart) lines.push('A gentle start for your scalp');

  if (plan.goals.length > 0) {
    const names = plan.goals.map((v) => labelFor('goal', v).toLowerCase());
    lines.push(`Goal: ${names.join(', ')}`);
  }

  return lines;
}