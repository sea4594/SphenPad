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
    const screenOrientation = window.screen?.orientation;
    let lastLandscapeDirection: "cw" | "ccw" = "ccw";
    let orientationRefreshTimeouts: number[] = [];

    const getViewportSize = () => {
      const layoutW = Math.max(1, Math.round(window.innerWidth));
      const layoutH = Math.max(1, Math.round(window.innerHeight));
      const visualW = Math.max(1, Math.round(visualViewport?.width ?? layoutW));
      const visualH = Math.max(1, Math.round(visualViewport?.height ?? layoutH));
      const vw = Math.max(layoutW, visualW);
      const vh = Math.max(layoutH, visualH);
      return { vw, vh };
    };

    const getLandscapeDirection = (): "cw" | "ccw" => {
      const legacyAngle = (window as LegacyOrientationWindow).orientation;
      if (typeof legacyAngle === "number" && Math.abs(legacyAngle) === 90) {
        // On iOS, window.orientation exposes left/right-side-down directly.
        // +90: left side down -> rotate content CW.
        // -90: right side down -> rotate content CCW.
        lastLandscapeDirection = legacyAngle > 0 ? "cw" : "ccw";
        return lastLandscapeDirection;
      }

      const angle = screenOrientation?.angle;
      if (typeof angle === "number") {
        const normalized = ((angle % 360) + 360) % 360;
        if (normalized === 90) {
          // screen.orientation.angle uses clockwise-positive rotation.
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

    const scheduleOrientationRefresh = () => {
      for (const timeoutId of orientationRefreshTimeouts) {
        window.clearTimeout(timeoutId);
      }
      orientationRefreshTimeouts = [120, 320].map((delay) => (
        window.setTimeout(() => {
          updateForcedPortraitMode();
        }, delay)
      ));
    };

    const updateForcedPortraitMode = () => {
      const { vw, vh } = getViewportSize();
      const rotatedLandscape = vw > vh;
      if (onMobileDevice && rotatedLandscape) {
        // vw = landscape visual width (long side = maps to portrait height after rotation)
        // vh = landscape visual height (short side = maps to portrait width after rotation)
        root.style.setProperty("--screen-w", `${vw}px`);
        root.style.setProperty("--screen-h", `${vh}px`);
        root.setAttribute("data-force-portrait", getLandscapeDirection());
      } else {
        root.removeAttribute("data-force-portrait");
        root.style.removeProperty("--screen-w");
        root.style.removeProperty("--screen-h");
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
      // Safari can report stale orientation values briefly after rotating.
      scheduleOrientationRefresh();
    };

    updateForcedPortraitMode();
    void lockPortrait();
    window.addEventListener("focus", relockIfVisible);
    document.addEventListener("visibilitychange", relockIfVisible);
    window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    screenOrientation?.addEventListener?.("change", onViewportChange);
    visualViewport?.addEventListener("resize", onViewportChange);
    coarsePointer.addEventListener?.("change", onViewportChange);

    return () => {
      window.removeEventListener("focus", relockIfVisible);
      document.removeEventListener("visibilitychange", relockIfVisible);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      screenOrientation?.removeEventListener?.("change", onViewportChange);
      visualViewport?.removeEventListener("resize", onViewportChange);
      coarsePointer.removeEventListener?.("change", onViewportChange);
      for (const timeoutId of orientationRefreshTimeouts) {
        window.clearTimeout(timeoutId);
      }
      orientationRefreshTimeouts = [];
      root.removeAttribute("data-force-portrait");
      root.style.removeProperty("--screen-w");
      root.style.removeProperty("--screen-h");
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
