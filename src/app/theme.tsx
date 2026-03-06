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

function readInitialTheme(): { mode: ThemeMode; color: ThemeColor } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: "dark", color: "ocean" };
    const parsed = JSON.parse(raw) as { mode?: ThemeMode; color?: ThemeColor | "sunset" };
    const mode: ThemeMode = parsed.mode === "light" || parsed.mode === "dark" ? parsed.mode : "dark";
    const mappedColor = parsed.color === "sunset" ? "sepia" : parsed.color;
    const color: ThemeColor = ["bw", "ocean", "forest", "sepia", "berry"].includes(mappedColor ?? "")
      ? (mappedColor as ThemeColor)
      : "ocean";
    return { mode, color };
  } catch {
    return { mode: "dark", color: "ocean" };
  }
}

export function ThemeProvider(props: { children: ReactNode }) {
  const initialTheme = readInitialTheme();
  const [mode, setMode] = useState<ThemeMode>(initialTheme.mode);
  const [color, setColor] = useState<ThemeColor>(initialTheme.color);

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

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, color }));
  }, [mode, color]);

  const value = useMemo(() => ({ mode, color, setMode, setColor }), [mode, color]);
  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
