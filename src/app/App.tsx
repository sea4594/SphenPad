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

    const getViewportBottomGap = () => {
      const screenW = Math.max(1, Math.round(window.screen?.width ?? window.innerWidth));
      const screenH = Math.max(1, Math.round(window.screen?.height ?? window.innerHeight));
      const viewportW = Math.max(1, Math.round(window.innerWidth));
      const viewportH = Math.max(1, Math.round(window.innerHeight));
      const visualW = Math.max(1, Math.round(visualViewport?.width ?? viewportW));
      const visualH = Math.max(1, Math.round(visualViewport?.height ?? viewportH));
      const screenLong = Math.max(screenW, screenH);
      const screenShort = Math.min(screenW, screenH);
      const isLandscape = viewportW > viewportH || visualW > visualH;
      const expectedHeight = isLandscape ? screenShort : screenLong;
      const actualHeight = Math.max(viewportH, visualH);
      return Math.max(0, expectedHeight - actualHeight);
    };

    const getLandscapeDirection = (): "cw" | "ccw" => {
      const legacyAngle = (window as LegacyOrientationWindow).orientation;
      if (typeof legacyAngle === "number" && Math.abs(legacyAngle) === 90) {
        // iOS +90: left side down (landscape-left) → rotate content CW to correct.
        // iOS -90: right side down (landscape-right) → rotate content CCW.
        lastLandscapeDirection = legacyAngle > 0 ? "cw" : "ccw";
        return lastLandscapeDirection;
      }

      const angle = window.screen?.orientation?.angle;
      if (typeof angle === "number") {
        const normalized = ((angle % 360) + 360) % 360;
        if (normalized === 90) {
          lastLandscapeDirection = "cw";
          return lastLandscapeDirection;
        }
        if (normalized === 270) {
          lastLandscapeDirection = "ccw";
          return lastLandscapeDirection;
        }
      }

      return lastLandscapeDirection;
    };

    const updateForcedPortraitMode = () => {
      const vw = Math.max(1, Math.round(window.innerWidth));
      const vh = Math.max(1, Math.round(window.innerHeight));
      const viewportGap = onMobileDevice ? getViewportBottomGap() : 0;
      root.style.setProperty("--measured-viewport-gap", `${viewportGap}px`);
      const rotatedLandscape = vw > vh;
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
    };

    updateForcedPortraitMode();
    void lockPortrait();
    window.addEventListener("focus", relockIfVisible);
    document.addEventListener("visibilitychange", relockIfVisible);
    window.addEventListener("pointerdown", onFirstInteraction, { passive: true });
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    visualViewport?.addEventListener("resize", onViewportChange);
    visualViewport?.addEventListener("scroll", onViewportChange);
    coarsePointer.addEventListener?.("change", onViewportChange);

    return () => {
      window.removeEventListener("focus", relockIfVisible);
      document.removeEventListener("visibilitychange", relockIfVisible);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
      visualViewport?.removeEventListener("resize", onViewportChange);
      visualViewport?.removeEventListener("scroll", onViewportChange);
      coarsePointer.removeEventListener?.("change", onViewportChange);
      root.removeAttribute("data-force-portrait");
      root.style.removeProperty("--measured-viewport-gap");
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
