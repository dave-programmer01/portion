/**
 * The user's status badge, derived from real activity. Shared so the Profile
 * screen and the Settings profile card always show the same label instead of
 * one of them hardcoding it.
 */
export function badgeFor(streakDays: number, totalWorkouts: number): string {
  if (streakDays >= 7) return "On a Streak";
  if (totalWorkouts > 0) return "Consistent Achiever";
  return "Getting Started";
}
