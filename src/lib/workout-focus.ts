/**
 * Workout focus areas — what the user wants to train. Shared by the client
 * picker, the plan API, and the AI generator so the mapping lives in one place.
 *
 * Each focus key maps to the exercise library's `muscleGroup` values (see
 * server/exercises-data.ts). `full_body` is the balanced default and selects
 * everything (empty muscle-group list = no restriction).
 */

export type FocusArea =
  | "full_body"
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "legs"
  | "abs";

export type FocusOption = {
  key: FocusArea;
  label: string;
  /** SF Symbol for the picker chip. */
  icon: string;
  /** Library `muscleGroup` values this focus covers (empty = all, for full_body). */
  muscleGroups: string[];
};

export const FOCUS_OPTIONS: FocusOption[] = [
  { key: "full_body", label: "Full Body", icon: "figure.mixed.cardio", muscleGroups: [] },
  { key: "chest", label: "Chest", icon: "figure.arms.open", muscleGroups: ["Chest"] },
  { key: "back", label: "Back", icon: "figure.rower", muscleGroups: ["Back"] },
  {
    key: "shoulders",
    label: "Shoulders",
    icon: "figure.strengthtraining.functional",
    muscleGroups: ["Shoulders", "Rear Delts"],
  },
  { key: "arms", label: "Arms", icon: "dumbbell", muscleGroups: ["Biceps", "Triceps"] },
  {
    key: "legs",
    label: "Legs",
    icon: "figure.strengthtraining.traditional",
    muscleGroups: ["Legs", "Hamstrings", "Glutes", "Calves"],
  },
  { key: "abs", label: "Abs", icon: "figure.core.training", muscleGroups: ["Core"] },
];

const VALID = new Set<string>(FOCUS_OPTIONS.map((o) => o.key));

/** Coerce arbitrary input into a clean focus list; falls back to full body. */
export function normalizeFocus(input: unknown): FocusArea[] {
  if (!Array.isArray(input)) return ["full_body"];
  const cleaned = input.filter(
    (v): v is FocusArea => typeof v === "string" && VALID.has(v),
  );
  // "full body" is exclusive, and an empty selection means full body too.
  if (cleaned.length === 0 || cleaned.includes("full_body")) return ["full_body"];
  // De-dupe while preserving order.
  return [...new Set(cleaned)];
}

/** True when the selection is the balanced full-body default. */
export function isFullBody(focus: FocusArea[]): boolean {
  return focus.length === 0 || focus.includes("full_body");
}

/** Expand a focus selection to the library muscle groups to prioritize. */
export function focusMuscleGroups(focus: FocusArea[]): string[] {
  if (isFullBody(focus)) return [];
  const groups = new Set<string>();
  for (const opt of FOCUS_OPTIONS) {
    if (focus.includes(opt.key)) opt.muscleGroups.forEach((g) => groups.add(g));
  }
  return [...groups];
}

/** Human label for a selection, e.g. "Chest & Arms" or "Chest, Arms +1". */
export function focusLabel(focus: FocusArea[]): string {
  if (isFullBody(focus)) return "Full Body";
  const labels = FOCUS_OPTIONS.filter((o) => focus.includes(o.key)).map(
    (o) => o.label,
  );
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
}

/** Plan title for a given day count + focus. */
export function planName(days: number, focus: FocusArea[]): string {
  if (isFullBody(focus)) {
    if (days <= 3) return "3-Day Full Body";
    if (days === 4) return "4-Day Upper / Lower";
    return `${days}-Day Push / Pull / Legs`;
  }
  return `${days}-Day ${focusLabel(focus)} Focus`;
}
