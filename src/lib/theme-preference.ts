import { useEffect } from "react";
import { useColorScheme } from "nativewind";
import * as SecureStore from "expo-secure-store";

/**
 * Manual dark-mode override, persisted in SecureStore. By default the app
 * follows the system scheme (NativeWind default); the Settings toggle lets the
 * user pin light/dark, and the choice survives restarts.
 */

const KEY = "portion-theme-pref";
export type ThemePref = "light" | "dark" | "system";

function isPref(v: string | null): v is ThemePref {
  return v === "light" || v === "dark" || v === "system";
}

/** Apply the saved preference on app start. Call once, high in the tree. */
export function useApplyStoredTheme(): void {
  const { setColorScheme } = useColorScheme();
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(KEY)
      .then((v) => {
        if (active && isPref(v) && v !== "system") setColorScheme(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [setColorScheme]);
}

/** Read + set the theme, persisting the choice. */
export function useThemePref() {
  const { colorScheme, setColorScheme } = useColorScheme();

  const setPref = (pref: ThemePref) => {
    setColorScheme(pref);
    void SecureStore.setItemAsync(KEY, pref).catch(() => {});
  };

  return {
    /** Effective scheme currently rendered ("light" | "dark"). */
    colorScheme,
    isDark: colorScheme === "dark",
    setPref,
    /** Binary toggle used by the Settings switch. */
    setDark: (on: boolean) => setPref(on ? "dark" : "light"),
  };
}
