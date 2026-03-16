import { useEffect } from "react";
import { Routes, Route, HashRouter, Navigate } from "react-router-dom";
import { MainMenu } from "../ui/MainMenu";
import { PuzzlePage } from "../ui/PuzzlePage";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { FoldersPage } from "../ui/FoldersPage";
import {
  applyForcedPortrait,
  clearForcedPortrait,
  detectLandscapeDirection,
  FORCED_PORTRAIT_REFRESH_DELAYS,
  getViewportSize,
  type ForcedPortraitDirection,
} from "./forcedPortrait";
import { ThemeProvider } from "./theme";

export function App() {
  useEffect(() => {
    type LegacyOrientationWindow = Window & { orientation?: number };
    type LockableOrientation = ScreenOrientation & { lock?: (kind: string) => Promise<void> };
    const root = document.documentElement;
    const onMobileDevice =
      /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
    const visualViewport = window.visualViewport;
    const screenOrientation = window.screen?.orientation;
    let lastLandscapeDirection: ForcedPortraitDirection = "ccw";
    let orientationRefreshTimeouts: number[] = [];

    const clearRefreshTimeouts = () => {
      for (const timeoutId of orientationRefreshTimeouts) {
        window.clearTimeout(timeoutId);
      }
      orientationRefreshTimeouts = [];
    };

    const syncForcedPortraitMode = () => {
      const viewport = getViewportSize(visualViewport);
      if (onMobileDevice && viewport.vw > viewport.vh) {
        lastLandscapeDirection = detectLandscapeDirection(
          screenOrientation,
          (window as LegacyOrientationWindow).orientation,
          lastLandscapeDirection,
        );
        applyForcedPortrait(root, lastLandscapeDirection, viewport);
        return;
      }

      clearForcedPortrait(root);
    };

    const scheduleOrientationRefresh = () => {
      clearRefreshTimeouts();
      orientationRefreshTimeouts = FORCED_PORTRAIT_REFRESH_DELAYS.map((delay) => (
        window.setTimeout(syncForcedPortraitMode, delay)
      ));
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
        syncForcedPortraitMode();
        void lockPortrait();
      }
    };

    const onFirstInteraction = () => {
      void lockPortrait();
      window.removeEventListener("pointerdown", onFirstInteraction);
    };

    const onViewportChange = () => {
      syncForcedPortraitMode();
      scheduleOrientationRefresh();
    };

    syncForcedPortraitMode();
    void lockPortrait();
    window.addEventListener("focus", relockIfVisible);
    document.addEventListener("visibilitychange", relockIfVisible);
    window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    screenOrientation?.addEventListener?.("change", onViewportChange);
    visualViewport?.addEventListener("resize", onViewportChange);

    return () => {
      window.removeEventListener("focus", relockIfVisible);
      document.removeEventListener("visibilitychange", relockIfVisible);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      screenOrientation?.removeEventListener?.("change", onViewportChange);
      visualViewport?.removeEventListener("resize", onViewportChange);
      clearRefreshTimeouts();
      clearForcedPortrait(root);
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
