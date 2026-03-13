import { useEffect } from "react";
import { Routes, Route, HashRouter, Navigate } from "react-router-dom";
import { MainMenu } from "../ui/MainMenu";
import { PuzzlePage } from "../ui/PuzzlePage";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { FoldersPage } from "../ui/FoldersPage";
import { ThemeProvider } from "./theme";

export function App() {
  useEffect(() => {
    type LegacyOrientationWindow = Window & { orientation?: number };
    type LockableOrientation = ScreenOrientation & { lock?: (kind: string) => Promise<void> };
    const root = document.documentElement;
    const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)");
    const mobilePlatform = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    const touchPrimaryInput = coarsePointer.matches && navigator.maxTouchPoints > 1;
    const onMobileDevice = mobilePlatform || touchPrimaryInput;
    const visualViewport = window.visualViewport;
    let lastLandscapeDirection: "cw" | "ccw" = "ccw";

    const getViewportSize = () => {
      const layoutW = Math.max(1, Math.round(window.innerWidth));
      const layoutH = Math.max(1, Math.round(window.innerHeight));
      const vw = Math.max(1, Math.round(visualViewport?.width ?? layoutW));
      const vh = Math.max(1, Math.round(visualViewport?.height ?? layoutH));
      return { vw, vh };
    };

    const getLandscapeDirection = (): "cw" | "ccw" => {
      const legacyAngle = (window as LegacyOrientationWindow).orientation;
      if (typeof legacyAngle === "number" && Math.abs(legacyAngle) === 90) {
        // Keep content upright by applying the opposite rotation of the current device angle.
        lastLandscapeDirection = legacyAngle > 0 ? "ccw" : "cw";
        return lastLandscapeDirection;
      }

      const angle = window.screen?.orientation?.angle;
      if (typeof angle === "number") {
        const normalized = ((angle % 360) + 360) % 360;
        if (normalized === 90) {
          lastLandscapeDirection = "ccw";
          return lastLandscapeDirection;
        }
        if (normalized === 270) {
          lastLandscapeDirection = "cw";
          return lastLandscapeDirection;
        }
      }

      return lastLandscapeDirection;
    };

    const updateForcedPortraitMode = () => {
      const { vw, vh } = getViewportSize();
      root.style.setProperty("--app-vh", `${vh}px`);
      const rotatedLandscape = vw > vh;
      if (onMobileDevice && rotatedLandscape) {
        const shortSide = Math.min(vw, vh);
        const longSide = Math.max(vw, vh);
        root.style.setProperty("--force-portrait-short", `${shortSide}px`);
        root.style.setProperty("--force-portrait-long", `${longSide}px`);
        root.setAttribute("data-force-portrait", getLandscapeDirection());
      } else {
        root.removeAttribute("data-force-portrait");
        root.style.removeProperty("--force-portrait-short");
        root.style.removeProperty("--force-portrait-long");
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
    };

    updateForcedPortraitMode();
    void lockPortrait();
    window.addEventListener("focus", relockIfVisible);
    document.addEventListener("visibilitychange", relockIfVisible);
    window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    visualViewport?.addEventListener("resize", onViewportChange);
    coarsePointer.addEventListener?.("change", onViewportChange);

    return () => {
      window.removeEventListener("focus", relockIfVisible);
      document.removeEventListener("visibilitychange", relockIfVisible);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      visualViewport?.removeEventListener("resize", onViewportChange);
      coarsePointer.removeEventListener?.("change", onViewportChange);
      root.removeAttribute("data-force-portrait");
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--force-portrait-short");
      root.style.removeProperty("--force-portrait-long");
    };
  }, []);

  return (
    <ThemeProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<MainMenu />} />
          <Route path="/folders" element={<FoldersPage />} />
          <Route path="/archive" element={<CtCArchivePage />} />
          <Route path="/p/:puzzleId" element={<PuzzlePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}
