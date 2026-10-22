// Onboarding content and step order. Edit copy here only; the screen reads from this file.

export type Option = { value: string; label: string };

export type Question = {
  id: string;
  title: string;
  subtitle?: string;
  type: 'single' | 'multi';
  options: Option[];
  /** For multi-select: picking this value clears the others (and vice versa). */
  exclusive?: string;
  /** Optional short note shown under the options. */
  tip?: string;
};

export type Step =
  | { kind: 'question'; questionId: string }
  | { kind: 'info'; id: string; title: string; body: string };

/** Answers are always stored as arrays of option values, keyed by question id. */
export type Answers = Record<string, string[]>;

export const QUESTIONS: Record<string, Question> = {
  goal: {
    id: 'goal',
    title: 'What do you want most?',
    subtitle: 'Pick all that apply.',
    type: 'multi',
    options: [
      { value: 'thicker', label: 'Thicker hair' },
      { value: 'less_shedding', label: 'Less shedding' },
      { value: 'fuller_hairline', label: 'A fuller hairline' },
      { value: 'healthier_scalp', label: 'A healthier scalp' },
    ],
  },
  areas: {
    id: 'areas',
    title: 'Where are you most concerned?',
    subtitle: 'Pick all that apply.',
    type: 'multi',
    exclusive: 'all_over',
    // TODO: swap for the tappable head diagram once it has three zones.
    options: [
      { value: 'hairline', label: 'Hairline' },
      { value: 'vertex', label: 'Crown' },
      { value: 'sides', label: 'Sides' },
      { value: 'all_over', label: 'All over' },
    ],
  },
  duration: {
    id: 'duration',
    title: 'How long have you noticed thinning?',
    type: 'single',
    options: [
      { value: 'under_1', label: 'Under 1 year' },
      { value: '1_3', label: '1 to 3 years' },
      { value: 'over_3', label: 'More than 3 years' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  hairType: {
    id: 'hairType',
    title: 'What is your hair like?',
    type: 'single',
    options: [
      { value: 'straight', label: 'Straight' },
      { value: 'wavy', label: 'Wavy' },
      { value: 'curly', label: 'Curly' },
      { value: 'coily', label: 'Coily' },
    ],
  },
  scalpFeel: {
    id: 'scalpFeel',
    title: 'How does your scalp usually feel?',
    type: 'single',
    options: [
      { value: 'oily', label: 'Oily' },
      { value: 'dry', label: 'Dry' },
      { value: 'normal', label: 'Normal' },
      { value: 'itchy_flaky', label: 'Itchy or flaky' },
    ],
  },
  minutes: {
    id: 'minutes',
    title: 'How long can you massage each day?',
    type: 'single',
    options: [
      { value: '5', label: '5 minutes' },
      { value: '10', label: '10 minutes' },
      { value: '15', label: '15 minutes' },
      { value: '20_plus', label: '20 minutes or more' },
    ],
  },
  when: {
    id: 'when',
    title: 'When works best for you?',
    type: 'single',
    tip: 'The plan is built around two sessions a day, about 12 hours apart, so each part of your scalp gets time to rest. You will start with short sessions and build up gradually.',
    options: [
      { value: 'morning', label: 'Morning' },
      { value: 'evening', label: 'Evening' },
      { value: 'both', label: 'Both' },
    ],
  },
  commitment: {
    id: 'commitment',
    title: 'Are you ready to stay consistent?',
    subtitle: 'Results take months of regular sessions.',
    type: 'single',
    options: [
      { value: 'ready', label: "Yes, let's go" },
      { value: 'will_try', label: "I'll try" },
    ],
  },
};

export const STEPS: Step[] = [
  { kind: 'question', questionId: 'goal' },
  { kind: 'question', questionId: 'areas' },
  { kind: 'question', questionId: 'duration' },
  { kind: 'question', questionId: 'hairType' },
  { kind: 'question', questionId: 'scalpFeel' },
  {
    kind: 'info',
    id: 'consistency',
    title: 'Consistency matters most',
    body: 'A short daily routine you keep up beats a long one you skip. Your plan is built around that.',
  },
  // 'minutes' is intentionally not in the flow: every plan starts with short sessions and ramps up.
  { kind: 'question', questionId: 'when' },
  { kind: 'question', questionId: 'commitment' },
];