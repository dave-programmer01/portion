/**
 * Curated, safety-reviewed exercise library. Beginner-appropriate movements
 * only — the AI planner may reference these by `id` and nothing else, so unsafe
 * or highly technical lifts simply don't exist here. `equipment` is the minimum
 * needed; `any` means it works with whatever the user has.
 */
export type SeedExercise = {
  id: string;
  name: string;
  muscleGroup: string;
  category: "compound" | "isolation";
  equipment: "bodyweight" | "dumbbells" | "barbell" | "machine" | "cable";
  instructions: string;
  defaultSets: number;
  defaultReps: string;
};

export const EXERCISE_SEED: SeedExercise[] = [
  // --- Legs / glutes ---
  { id: "bodyweight-squat", name: "Bodyweight Squat", muscleGroup: "Legs", category: "compound", equipment: "bodyweight", instructions: "Feet shoulder-width, sit back and down keeping chest up, drive through heels.", defaultSets: 3, defaultReps: "12-15" },
  { id: "goblet-squat", name: "Goblet Squat", muscleGroup: "Legs", category: "compound", equipment: "dumbbells", instructions: "Hold a dumbbell at your chest, squat down between your knees, stand tall.", defaultSets: 3, defaultReps: "8-12" },
  { id: "barbell-back-squat", name: "Barbell Back Squat", muscleGroup: "Legs", category: "compound", equipment: "barbell", instructions: "Bar on upper back, brace, squat to parallel, drive up through midfoot.", defaultSets: 3, defaultReps: "5-8" },
  { id: "leg-press", name: "Leg Press", muscleGroup: "Legs", category: "compound", equipment: "machine", instructions: "Feet mid-platform, lower until knees ~90°, press without locking out hard.", defaultSets: 3, defaultReps: "10-12" },
  { id: "walking-lunge", name: "Walking Lunge", muscleGroup: "Legs", category: "compound", equipment: "bodyweight", instructions: "Step forward, drop back knee toward floor, push off to the next step.", defaultSets: 3, defaultReps: "10-12" },
  { id: "dumbbell-romanian-deadlift", name: "Dumbbell Romanian Deadlift", muscleGroup: "Hamstrings", category: "compound", equipment: "dumbbells", instructions: "Soft knees, hinge at hips pushing them back, feel the hamstring stretch, stand.", defaultSets: 3, defaultReps: "10-12" },
  { id: "glute-bridge", name: "Glute Bridge", muscleGroup: "Glutes", category: "isolation", equipment: "bodyweight", instructions: "Lie on back, feet flat, drive hips up squeezing glutes, lower slowly.", defaultSets: 3, defaultReps: "12-15" },
  { id: "leg-curl", name: "Seated Leg Curl", muscleGroup: "Hamstrings", category: "isolation", equipment: "machine", instructions: "Curl the pad down by bending the knees, control the return.", defaultSets: 3, defaultReps: "12-15" },
  { id: "calf-raise", name: "Standing Calf Raise", muscleGroup: "Calves", category: "isolation", equipment: "bodyweight", instructions: "Rise onto the balls of your feet, pause at the top, lower under control.", defaultSets: 3, defaultReps: "15-20" },

  // --- Chest / push ---
  { id: "push-up", name: "Push-Up", muscleGroup: "Chest", category: "compound", equipment: "bodyweight", instructions: "Hands under shoulders, body in a line, lower chest to floor, press up.", defaultSets: 3, defaultReps: "8-15" },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", muscleGroup: "Chest", category: "compound", equipment: "dumbbells", instructions: "Lower dumbbells to chest level, press up and slightly together.", defaultSets: 3, defaultReps: "8-12" },
  { id: "barbell-bench-press", name: "Barbell Bench Press", muscleGroup: "Chest", category: "compound", equipment: "barbell", instructions: "Lower bar to mid-chest, elbows ~45°, press back over shoulders.", defaultSets: 3, defaultReps: "5-8" },
  { id: "incline-dumbbell-press", name: "Incline Dumbbell Press", muscleGroup: "Chest", category: "compound", equipment: "dumbbells", instructions: "On a 30° incline, press dumbbells up from upper-chest height.", defaultSets: 3, defaultReps: "8-12" },
  { id: "chest-fly", name: "Dumbbell Chest Fly", muscleGroup: "Chest", category: "isolation", equipment: "dumbbells", instructions: "Slight elbow bend, open arms wide, hug them back together over chest.", defaultSets: 3, defaultReps: "12-15" },

  // --- Shoulders ---
  { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", muscleGroup: "Shoulders", category: "compound", equipment: "dumbbells", instructions: "Press dumbbells overhead from shoulder height, lower under control.", defaultSets: 3, defaultReps: "8-12" },
  { id: "pike-push-up", name: "Pike Push-Up", muscleGroup: "Shoulders", category: "compound", equipment: "bodyweight", instructions: "Hips high in an inverted V, lower crown toward floor, press up.", defaultSets: 3, defaultReps: "6-10" },
  { id: "lateral-raise", name: "Lateral Raise", muscleGroup: "Shoulders", category: "isolation", equipment: "dumbbells", instructions: "Raise dumbbells out to the sides to shoulder height, lead with elbows.", defaultSets: 3, defaultReps: "12-15" },

  // --- Back / pull ---
  { id: "inverted-row", name: "Inverted Row", muscleGroup: "Back", category: "compound", equipment: "bodyweight", instructions: "Under a bar/table, body straight, pull chest to the bar, lower slowly.", defaultSets: 3, defaultReps: "8-12" },
  { id: "dumbbell-row", name: "One-Arm Dumbbell Row", muscleGroup: "Back", category: "compound", equipment: "dumbbells", instructions: "Hand and knee on bench, pull dumbbell to hip, squeeze the back.", defaultSets: 3, defaultReps: "8-12" },
  { id: "lat-pulldown", name: "Lat Pulldown", muscleGroup: "Back", category: "compound", equipment: "machine", instructions: "Pull the bar to upper chest, drive elbows down, control the return.", defaultSets: 3, defaultReps: "10-12" },
  { id: "seated-cable-row", name: "Seated Cable Row", muscleGroup: "Back", category: "compound", equipment: "cable", instructions: "Pull the handle to your stomach, squeeze shoulder blades, extend slowly.", defaultSets: 3, defaultReps: "10-12" },
  { id: "barbell-row", name: "Barbell Row", muscleGroup: "Back", category: "compound", equipment: "barbell", instructions: "Hinge forward ~45°, pull bar to lower ribs, control down.", defaultSets: 3, defaultReps: "6-10" },
  { id: "face-pull", name: "Face Pull", muscleGroup: "Rear Delts", category: "isolation", equipment: "cable", instructions: "Pull rope toward your face, elbows high, squeeze rear delts.", defaultSets: 3, defaultReps: "12-15" },

  // --- Arms ---
  { id: "dumbbell-curl", name: "Dumbbell Biceps Curl", muscleGroup: "Biceps", category: "isolation", equipment: "dumbbells", instructions: "Curl dumbbells up without swinging, squeeze, lower under control.", defaultSets: 3, defaultReps: "10-12" },
  { id: "hammer-curl", name: "Hammer Curl", muscleGroup: "Biceps", category: "isolation", equipment: "dumbbells", instructions: "Neutral grip, curl up keeping thumbs pointing forward, lower slowly.", defaultSets: 3, defaultReps: "10-12" },
  { id: "triceps-dip", name: "Bench Triceps Dip", muscleGroup: "Triceps", category: "isolation", equipment: "bodyweight", instructions: "Hands on a bench behind you, lower by bending elbows, press back up.", defaultSets: 3, defaultReps: "8-12" },
  { id: "triceps-pushdown", name: "Triceps Pushdown", muscleGroup: "Triceps", category: "isolation", equipment: "cable", instructions: "Elbows pinned, push the rope/bar down until arms straight, control up.", defaultSets: 3, defaultReps: "10-15" },
  { id: "overhead-dumbbell-extension", name: "Overhead Dumbbell Extension", muscleGroup: "Triceps", category: "isolation", equipment: "dumbbells", instructions: "Hold one dumbbell overhead, lower behind head, extend back up.", defaultSets: 3, defaultReps: "10-12" },

  // --- Core ---
  { id: "plank", name: "Plank", muscleGroup: "Core", category: "isolation", equipment: "bodyweight", instructions: "Forearms down, body in a straight line, brace abs and glutes, hold.", defaultSets: 3, defaultReps: "30-45s" },
  { id: "dead-bug", name: "Dead Bug", muscleGroup: "Core", category: "isolation", equipment: "bodyweight", instructions: "On back, extend opposite arm and leg while keeping low back flat.", defaultSets: 3, defaultReps: "10-12" },
  { id: "hanging-knee-raise", name: "Hanging Knee Raise", muscleGroup: "Core", category: "isolation", equipment: "bodyweight", instructions: "Hang from a bar, raise knees toward chest, lower without swinging.", defaultSets: 3, defaultReps: "10-15" },
];
