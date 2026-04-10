import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onSyncedLocalDataApplied, setSyncedLocalStorageItem } from "../core/localDataState";

export type ThemeMode = "light" | "dark";
export type ThemeColor = "bw" | "ocean" | "forest" | "clay" | "berry";

type ThemeContextValue = {
  mode: ThemeMode;
  color: ThemeColor;
  hideTimer: boolean;
  outlineDigits: boolean;
  conflictChecker: boolean;
  setTheme: (mode: ThemeMode, color: ThemeColor) => void;
  setMode: (mode: ThemeMode) => void;
  setColor: (color: ThemeColor) => void;
  setHideTimer: (hideTimer: boolean) => void;
  setOutlineDigits: (outlineDigits: boolean) => void;
  setConflictChecker: (conflictChecker: boolean) => void;
};

const STORAGE_KEY = "sphenpad-theme-v1";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeThemeSelection(mode: ThemeMode, color: ThemeColor): { mode: ThemeMode; color: ThemeColor } {
  if (color === "bw" || color === "ocean") return { mode, color };
  return { mode: "light", color };
}

function readInitialTheme(): { mode: ThemeMode; color: ThemeColor; hideTimer: boolean; outlineDigits: boolean; conflictChecker: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: "light", color: "ocean", hideTimer: false, outlineDigits: true, conflictChecker: true };
    const parsed = JSON.parse(raw) as {
      mode?: ThemeMode;
      color?: ThemeColor | "sunset" | "sepia";
      hideTimer?: boolean;
      outlineDigits?: boolean;
      conflictChecker?: boolean;
    };
    const mode: ThemeMode = parsed.mode === "light" || parsed.mode === "dark" ? parsed.mode : "light";
    const mappedColor = parsed.color === "sunset" || parsed.color === "sepia" ? "clay" : parsed.color;
    const color: ThemeColor = ["bw", "ocean", "forest", "clay", "berry"].includes(mappedColor ?? "")
      ? (mappedColor as ThemeColor)
      : "ocean";
    const normalizedTheme = normalizeThemeSelection(mode, color);
    const hideTimer = typeof parsed.hideTimer === "boolean" ? parsed.hideTimer : false;
    const outlineDigits = typeof parsed.outlineDigits === "boolean" ? parsed.outlineDigits : true;
    const conflictChecker = typeof parsed.conflictChecker === "boolean" ? parsed.conflictChecker : true;
    return { mode: normalizedTheme.mode, color: normalizedTheme.color, hideTimer, outlineDigits, conflictChecker };
  } catch {
    return { mode: "light", color: "ocean", hideTimer: false, outlineDigits: true, conflictChecker: true };
  }
}

export function ThemeProvider(props: { children: ReactNode }) {
  const initialTheme = readInitialTheme();
  const [mode, setModeState] = useState<ThemeMode>(initialTheme.mode);
  const [color, setColorState] = useState<ThemeColor>(initialTheme.color);
  const [hideTimer, setHideTimer] = useState<boolean>(initialTheme.hideTimer);
  const [outlineDigits, setOutlineDigits] = useState<boolean>(initialTheme.outlineDigits);
  const [conflictChecker, setConflictChecker] = useState<boolean>(initialTheme.conflictChecker);

  const setTheme = (nextMode: ThemeMode, nextColor: ThemeColor) => {
    const normalized = normalizeThemeSelection(nextMode, nextColor);
    setModeState(normalized.mode);
    setColorState(normalized.color);
  };

  const setMode = (nextMode: ThemeMode) => {
    setTheme(nextMode, color);
  };

  const setColor = (nextColor: ThemeColor) => {
    setTheme(mode, nextColor);
  };

  useEffect(() => {
    const applyThemeFromStorage = () => {
      const next = readInitialTheme();
      setModeState(next.mode);
      setColorState(next.color);
      setHideTimer(next.hideTimer);
      setOutlineDigits(next.outlineDigits);
      setConflictChecker(next.conflictChecker);
    };
    return onSyncedLocalDataApplied(applyThemeFromStorage);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.theme = color;

    // Keep browser chrome (notch/status bar area) aligned with the active theme color.
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#191c22";
    let themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!themeMeta) {
      themeMeta = document.createElement("meta");
      themeMeta.name = "theme-color";
      document.head.appendChild(themeMeta);
    }
    themeMeta.content = bg;

    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;

    setSyncedLocalStorageItem(STORAGE_KEY, JSON.stringify({ mode, color, hideTimer, outlineDigits, conflictChecker }));
  }, [mode, color, hideTimer, outlineDigits, conflictChecker]);

  const value = useMemo(
    () => ({ mode, color, hideTimer, outlineDigits, conflictChecker, setTheme, setMode, setColor, setHideTimer, setOutlineDigits, setConflictChecker }),
    [mode, color, hideTimer, outlineDigits, conflictChecker],
  );
  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
