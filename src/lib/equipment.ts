import type { Equipment } from "@/db/schema";

/**
 * Equipment model. Users declare exactly what they own (a multi-select
 * inventory), and each exercise declares what it `requires` — so we only ever
 * program movements the user can actually do. An empty inventory = bodyweight.
 */

export type EquipmentItem =
  | "dumbbells"
  | "pullup_bar"
  | "bench"
  | "bands"
  | "barbell"
  | "machine"
  | "cable";

export const ALL_EQUIPMENT: EquipmentItem[] = [
  "dumbbells",
  "pullup_bar",
  "bench",
  "bands",
  "barbell",
  "machine",
  "cable",
];

/** The toggles shown in onboarding. One toggle can grant several raw items. */
export type EquipmentOption = {
  label: string;
  sublabel: string;
  icon: string;
  grants: EquipmentItem[];
};

export const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  { label: "Dumbbells", sublabel: "Adjustable or fixed", icon: "dumbbell.fill", grants: ["dumbbells"] },
  { label: "Pull-up bar", sublabel: "Doorway or wall-mounted", icon: "figure.strengthtraining.functional", grants: ["pullup_bar"] },
  { label: "Bench", sublabel: "Flat or adjustable", icon: "rectangle.fill", grants: ["bench"] },
  { label: "Resistance bands", sublabel: "Loops or tubes", icon: "bolt.horizontal.fill", grants: ["bands"] },
  { label: "Barbell & plates", sublabel: "With a rack", icon: "figure.strengthtraining.traditional", grants: ["barbell"] },
  { label: "Gym machines", sublabel: "Machines & cables", icon: "gearshape.2.fill", grants: ["machine", "cable"] },
];

const VALID = new Set<string>(ALL_EQUIPMENT);

/** Coerce arbitrary input into a clean owned-equipment list. */
export function normalizeEquipment(input: unknown): EquipmentItem[] {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input.filter((v): v is EquipmentItem => typeof v === "string" && VALID.has(v)),
    ),
  ];
}

/** Can an exercise requiring `requires` be performed with what the user `owns`? */
export function canPerform(requires: string[], owns: string[]): boolean {
  return requires.every((r) => owns.includes(r));
}

/**
 * Legacy tier for the existing NOT NULL `equipment` column, derived from the
 * inventory. Kept in sync so old code paths and analytics still work.
 */
export function deriveEquipmentTier(owns: string[]): Equipment {
  if (owns.some((i) => i === "barbell" || i === "machine" || i === "cable")) {
    return "full_gym";
  }
  if (owns.includes("dumbbells")) return "dumbbells";
  return "bodyweight";
}

/** Owned items for a profile that predates the inventory (falls back to tier). */
export function itemsFromTier(tier: Equipment): EquipmentItem[] {
  if (tier === "full_gym") return [...ALL_EQUIPMENT];
  if (tier === "dumbbells") return ["dumbbells"];
  return [];
}

/**
 * Resolve a profile's owned equipment: prefer the inventory, fall back to the
 * legacy tier for profiles created before the inventory existed.
 */
export function resolveOwnedEquipment(
  equipmentItems: unknown,
  tier: Equipment,
): EquipmentItem[] {
  const items = normalizeEquipment(equipmentItems);
  return items.length > 0 ? items : itemsFromTier(tier);
}

/** Short human summary for the AI prompt / UI. */
export function equipmentSummary(owns: string[]): string {
  if (owns.length === 0) return "bodyweight only (no equipment)";
  return owns.join(", ");
}

const ITEM_LABELS: Record<EquipmentItem, string> = {
  dumbbells: "Dumbbells",
  pullup_bar: "Pull-up bar",
  bench: "Bench",
  bands: "Bands",
  barbell: "Barbell",
  machine: "Machines",
  cable: "Cables",
};

/** Readable label list for display, e.g. "Dumbbells, Pull-up bar". */
export function equipmentLabels(owns: string[]): string {
  const items = normalizeEquipment(owns);
  if (items.length === 0) return "Bodyweight only";
  return items.map((i) => ITEM_LABELS[i]).join(", ");
}
