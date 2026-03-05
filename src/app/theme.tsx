import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark";
export type ThemeColor = "bw" | "ocean" | "forest" | "sepia" | "berry";

type ThemeContextValue = {
  mode: ThemeMode;
  color: ThemeColor;
  setMode: (mode: ThemeMode) => void;
  setColor: (color: ThemeColor) => void;
};

const STORAGE_KEY = "sphenpad-theme-v1";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider(props: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [color, setColor] = useState<ThemeColor>("ocean");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { mode?: ThemeMode; color?: ThemeColor | "sunset" };
      if (parsed.mode === "light" || parsed.mode === "dark") setMode(parsed.mode);
      const mappedColor = parsed.color === "sunset" ? "sepia" : parsed.color;
      if (["bw", "ocean", "forest", "sepia", "berry"].includes(mappedColor ?? "")) {
        setColor(mappedColor as ThemeColor);
      }
    } catch {
      // Ignore malformed stored themes.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.theme = color;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, color }));
  }, [mode, color]);

  const value = useMemo(() => ({ mode, color, setMode, setColor }), [mode, color]);
  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
