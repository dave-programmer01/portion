import { Text, View } from "react-native";
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

export function WorkoutSkeleton({
  caption,
  subcaption,
  footer,
}: {
  /** Optional status line (e.g. shown while the plan is generating). */
  caption?: string;
  subcaption?: string;
  /** Optional node pinned below the skeleton (e.g. a "taking a while" retry). */
  footer?: React.ReactNode;
} = {}) {
  return (
    <Screen>
      <Header rightWidth={44} />
      {caption ? (
        <View style={{ marginBottom: 16 }}>
          <Text className="text-center font-semibold text-[16px] text-ink">
            {caption}
          </Text>
          {subcaption ? (
            <Text className="mt-1 text-center font-regular text-[13px] text-muted">
              {subcaption}
            </Text>
          ) : null}
        </View>
      ) : null}
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
      {footer ? <View style={{ marginTop: 24 }}>{footer}</View> : null}
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

export function WorkoutDaySkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View style={{ padding: 20, paddingTop: 4, gap: 16 }}>
        {/* Header */}
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <SkeletonCircle size={36} />
          <Skeleton width={170} height={22} radius={7} />
        </View>
        {/* Stats card */}
        <Skeleton height={90} radius={16} />
        {/* Section heading */}
        <Skeleton width={120} height={16} radius={6} />
        {/* Exercise rows */}
        <View style={{ gap: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={64} radius={16} />
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

export function SessionSkeleton() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={["top", "bottom"]}>
      <View style={{ flex: 1, padding: 20, gap: 20 }}>
        {/* Top bar: close + progress + timer */}
        <View className="flex-row items-center justify-between">
          <SkeletonCircle size={36} />
          <Skeleton width={120} height={10} radius={5} />
          <SkeletonCircle size={36} />
        </View>
        {/* Current-exercise hero */}
        <Skeleton height={200} radius={20} />
        <Skeleton width={200} height={22} radius={7} />
        <Skeleton width={130} height={14} radius={6} />
        <View style={{ flex: 1 }} />
        {/* Primary action */}
        <Skeleton height={56} radius={28} />
      </View>
    </SafeAreaView>
  );
}

/** Inline list placeholder for search results (no full-screen chrome). */
export function SearchResultsSkeleton() {
  return (
    <View style={{ marginTop: 12, gap: 10 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} height={56} radius={16} />
      ))}
    </View>
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
