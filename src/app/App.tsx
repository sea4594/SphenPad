import { useEffect } from "react";
import { Routes, Route, HashRouter, Navigate } from "react-router-dom";
import { MainMenu } from "../ui/MainMenu";
import { PuzzlePage } from "../ui/PuzzlePage";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { ThemeProvider } from "./theme";

export function App() {
  useEffect(() => {
    type LegacyOrientationWindow = Window & { orientation?: number };
    type LockableOrientation = ScreenOrientation & { lock?: (kind: string) => Promise<void> };
    const root = document.documentElement;
    const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)");

    const getLandscapeDirection = (): "cw" | "ccw" => {
      const angle = window.screen?.orientation?.angle;
      if (typeof angle === "number") {
        const normalized = ((angle % 360) + 360) % 360;
        if (normalized === 90) return "cw";
        if (normalized === 270) return "ccw";
      }

      const legacyAngle = (window as LegacyOrientationWindow).orientation;
      if (typeof legacyAngle === "number") {
        if (legacyAngle > 0) return "cw";
        if (legacyAngle < 0) return "ccw";
      }

      return "ccw";
    };

    const updateForcedPortraitMode = () => {
      const shortSide = Math.min(window.innerWidth, window.innerHeight);
      const onMobileDevice = coarsePointer.matches || shortSide <= 1000;
      const rotatedLandscape = window.innerWidth > window.innerHeight;
      if (onMobileDevice && rotatedLandscape) {
        root.setAttribute("data-force-portrait", getLandscapeDirection());
      } else {
        root.removeAttribute("data-force-portrait");
      }
    };

    const lockPortrait = async () => {
      const orientation = window.screen?.orientation as LockableOrientation | undefined;
      if (!orientation?.lock) return;
      try {
        await orientation.lock("portrait");
      } catch {
        // Some browsers only allow this in fullscreen/PWA contexts.
      }
    };

    const relockIfVisible = () => {
      if (document.visibilityState === "visible") {
        updateForcedPortraitMode();
        void lockPortrait();
      }
    };

    const onFirstInteraction = () => {
      void lockPortrait();
      window.removeEventListener("pointerdown", onFirstInteraction);
    };

    const onViewportChange = () => {
      updateForcedPortraitMode();
      void lockPortrait();
    };

    updateForcedPortraitMode();
    void lockPortrait();
    window.addEventListener("focus", relockIfVisible);
    document.addEventListener("visibilitychange", relockIfVisible);
    window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    coarsePointer.addEventListener?.("change", onViewportChange);

    return () => {
      window.removeEventListener("focus", relockIfVisible);
      document.removeEventListener("visibilitychange", relockIfVisible);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      coarsePointer.removeEventListener?.("change", onViewportChange);
      root.removeAttribute("data-force-portrait");
    };
  }, []);

  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/archive" element={<CtCArchivePage />} />
          <Route path="/p/:puzzleId" element={<PuzzlePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
