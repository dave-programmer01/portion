import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";

import { useThemeColors } from "../lib/theme";

/**
 * Shared UI primitives styled with the Portion design system (see
 * tailwind.config.js: green / ink / muted / line / surface + Inter fonts).
 * Neutral surfaces use theme tokens (bg/card/surface) so they adapt to dark
 * mode; brand green + white-on-green stay fixed. Icon tints read the palette.
 */

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: SymbolViewProps["name"];
}) {
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      className="h-14 flex-row items-center justify-center rounded-[14px] bg-green active:opacity-90"
      style={{
        shadowColor: "#16A34A",
        shadowOpacity: 0.28,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <>
          {icon ? (
            <SymbolView
              name={icon}
              size={18}
              tintColor="#FFFFFF"
              weight="semibold"
              style={{ marginRight: 8 }}
            />
          ) : null}
          <Text className="font-semibold text-[16px] text-white">{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className="h-14 flex-row items-center justify-center rounded-[14px] border border-line bg-card active:opacity-90"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="font-semibold text-[16px] text-ink">{label}</Text>
    </Pressable>
  );
}

/** Tappable selection card — used for single-choice option lists. */
export function OptionCard({
  title,
  subtitle,
  icon,
  emoji,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon?: SymbolViewProps["name"];
  emoji?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className={`mb-3 flex-row items-center rounded-2xl border px-4 py-[14px] active:opacity-90 ${
        selected ? "border-green bg-green-surface" : "border-line bg-card"
      }`}
    >
      {emoji ? (
        <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl bg-surface">
          <Text className="text-[20px]">{emoji}</Text>
        </View>
      ) : icon ? (
        <View
          className={`mr-3 h-10 w-10 items-center justify-center rounded-xl ${
            selected ? "bg-green-light" : "bg-surface"
          }`}
        >
          <SymbolView
            name={icon}
            size={20}
            tintColor={selected ? colors.greenDark : colors.muted}
          />
        </View>
      ) : null}
      <View className="flex-1">
        <Text
          className={`font-semibold text-[15px] ${selected ? "text-green-dark" : "text-ink"}`}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-[2px] font-regular text-[13px] text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <SymbolView name="checkmark.circle.fill" size={22} tintColor="#22C55E" />
      ) : (
        <View className="h-[22px] w-[22px] rounded-full border border-line" />
      )}
    </Pressable>
  );
}

/** Horizontal segmented control for 2–3 mutually exclusive options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="flex-row rounded-2xl border border-line bg-surface p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            className={`flex-1 items-center rounded-xl py-[10px] ${active ? "bg-card" : ""}`}
            style={
              active
                ? {
                    shadowColor: "#000000",
                    shadowOpacity: 0.08,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  }
                : undefined
            }
          >
            <Text
              className={`font-semibold text-[14px] ${active ? "text-ink" : "text-muted"}`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Labelled numeric field with an optional trailing unit. */
export function NumberField({
  label,
  unit,
  value,
  onChangeText,
  placeholder,
  ...rest
}: {
  label: string;
  unit?: string;
} & TextInputProps) {
  const colors = useThemeColors();
  return (
    <View className="mb-4">
      <Text className="mb-2 font-medium text-[14px] text-muted">{label}</Text>
      <View className="flex-row items-center rounded-2xl border border-line bg-card px-4">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          keyboardType="numeric"
          className="h-14 flex-1 font-semibold text-[16px] text-ink"
          {...rest}
        />
        {unit ? (
          <Text className="ml-2 font-medium text-[15px] text-muted">{unit}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** Full-width text input (single line). */
export function TextField({
  label,
  ...rest
}: { label?: string } & TextInputProps) {
  const colors = useThemeColors();
  return (
    <View className="mb-4">
      {label ? (
        <Text className="mb-2 font-medium text-[14px] text-muted">{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.faint}
        className="rounded-2xl border border-line bg-card px-4 py-4 font-regular text-[15px] text-ink"
        {...rest}
      />
    </View>
  );
}

/** Simple centered empty / error / loading state. */
export function CenterState({
  icon,
  title,
  subtitle,
  children,
}: {
  icon?: SymbolViewProps["name"];
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-1 items-center justify-center px-10">
      {icon ? <SymbolView name={icon} size={40} tintColor={colors.faint} /> : null}
      <Text className="mt-4 text-center font-semibold text-[16px] text-ink">
        {title}
      </Text>
      {subtitle ? (
        <Text className="mt-1 text-center font-regular text-[14px] text-muted">
          {subtitle}
        </Text>
      ) : null}
      {children ? <View className="mt-5 w-full">{children}</View> : null}
    </View>
  );
}
