import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Skeleton, SkeletonCircle } from "./skeleton";

/**
 * Per-screen skeletons — each mirrors the real screen's silhouette so first
 * load feels like the content is arriving, not stalling behind a spinner. Shown
 * only on the initial fetch (loading with no data yet); pull-to-refresh keeps
 * the existing content in place.
 */

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top"]}>
      <View style={{ padding: 20, paddingTop: 4 }}>{children}</View>
    </SafeAreaView>
  );
}

export function HomeSkeleton() {
  return (
    <Screen>
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <SkeletonCircle size={36} />
        <Skeleton width={54} height={18} radius={6} />
        <View className="flex-row items-center gap-2">
          <SkeletonCircle size={36} />
          <Skeleton width={44} height={36} radius={18} />
        </View>
      </View>

      {/* Calorie ring + macros */}
      <View className="mt-6 flex-row items-center">
        <SkeletonCircle size={140} />
        <View className="ml-5 flex-1">
          {[0, 1, 2].map((i) => (
            <View key={i} className="mb-4">
              <Skeleton
                width={64}
                height={10}
                radius={5}
                style={{ marginBottom: 8 }}
              />
              <Skeleton height={6} radius={3} />
            </View>
          ))}
        </View>
      </View>

      {/* Suggested / budget cards */}
      <View className="mt-6" style={{ gap: 12 }}>
        <Skeleton height={64} radius={16} />
        <Skeleton height={120} radius={16} />
      </View>

      {/* Log again row */}
      <View className="mt-6 flex-row" style={{ gap: 8 }}>
        <Skeleton width={120} height={64} radius={16} />
        <Skeleton width={120} height={64} radius={16} />
        <Skeleton width={120} height={64} radius={16} />
      </View>
    </Screen>
  );
}

function Header({ rightWidth = 0 }: { rightWidth?: number }) {
  return (
    <View className="mb-5 flex-row items-center justify-between">
      <Skeleton width={130} height={24} radius={7} />
      {rightWidth ? <Skeleton width={rightWidth} height={34} radius={17} /> : null}
    </View>
  );
}

export function WorkoutSkeleton() {
  return (
    <Screen>
      <Header rightWidth={44} />
      {/* Today's workout hero */}
      <Skeleton height={140} radius={16} />
      {/* Section heading */}
      <View style={{ marginTop: 20 }}>
        <Skeleton width={140} height={16} radius={6} />
      </View>
      {/* Day rows */}
      <View style={{ marginTop: 12, gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={68} radius={16} />
        ))}
      </View>
    </Screen>
  );
}

export function FoodSkeleton() {
  return (
    <Screen>
      <Header rightWidth={44} />
      {/* Day totals summary */}
      <Skeleton height={84} radius={16} />
      {/* Meal groups */}
      <View style={{ marginTop: 20, gap: 20 }}>
        {[0, 1, 2].map((g) => (
          <View key={g} style={{ gap: 10 }}>
            <Skeleton width={110} height={14} radius={6} />
            <Skeleton height={60} radius={16} />
            <Skeleton height={60} radius={16} />
          </View>
        ))}
      </View>
    </Screen>
  );
}

export function ProgressSkeleton() {
  return (
    <Screen>
      <Header rightWidth={90} />
      {/* Weight card */}
      <Skeleton height={116} radius={16} />
      {/* Trend chart */}
      <View style={{ marginTop: 16 }}>
        <Skeleton height={180} radius={16} />
      </View>
      {/* Stat cards */}
      <View className="flex-row" style={{ marginTop: 16, gap: 12 }}>
        <View className="flex-1">
          <Skeleton height={92} radius={16} />
        </View>
        <View className="flex-1">
          <Skeleton height={92} radius={16} />
        </View>
      </View>
    </Screen>
  );
}
