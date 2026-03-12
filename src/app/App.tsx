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
    const mobilePlatform = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    const touchPrimaryInput = coarsePointer.matches && navigator.maxTouchPoints > 1;
    const visualViewport = window.visualViewport;
    let lastLandscapeDirection: "cw" | "ccw" = "ccw";

    const readViewportSize = () => {
      const layoutW = Math.max(1, Math.round(window.innerWidth));
      const layoutH = Math.max(1, Math.round(window.innerHeight));
      const visualW = Math.max(1, Math.round(visualViewport?.width ?? layoutW));
      const visualH = Math.max(1, Math.round(visualViewport?.height ?? layoutH));
      const offsetLeft = Math.max(0, Math.round(visualViewport?.offsetLeft ?? 0));
      const offsetTop = Math.max(0, Math.round(visualViewport?.offsetTop ?? 0));
      const insetRight = Math.max(0, layoutW - visualW - offsetLeft);
      const insetBottom = Math.max(0, layoutH - visualH - offsetTop);
      const vw = Math.max(layoutW, visualW);
      const vh = Math.max(layoutH, visualH);
      return {
        vw,
        vh,
        shortSide: Math.min(vw, vh),
        longSide: Math.max(vw, vh),
        insetLeft: offsetLeft,
        insetTop: offsetTop,
        insetRight,
        insetBottom,
      };
    };

    const getLandscapeDirection = (): "cw" | "ccw" => {
      const legacyAngle = (window as LegacyOrientationWindow).orientation;
      if (typeof legacyAngle === "number" && Math.abs(legacyAngle) === 90) {
        // `window.orientation` reflects device rotation from portrait; we need the opposite
        // sign here because data-force-portrait encodes the counter-rotation we apply.
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
      const { vw, vh, shortSide, longSide, insetLeft, insetTop, insetRight, insetBottom } = readViewportSize();
      const onMobileDevice = mobilePlatform || touchPrimaryInput;
      const rotatedLandscape = vw > vh;
      if (onMobileDevice && rotatedLandscape) {
        root.style.setProperty("--force-portrait-short", `${shortSide}px`);
        root.style.setProperty("--force-portrait-long", `${longSide}px`);
        root.style.setProperty("--force-viewport-inset-left", `${insetLeft}px`);
        root.style.setProperty("--force-viewport-inset-top", `${insetTop}px`);
        root.style.setProperty("--force-viewport-inset-right", `${insetRight}px`);
        root.style.setProperty("--force-viewport-inset-bottom", `${insetBottom}px`);
        root.setAttribute("data-force-portrait", getLandscapeDirection());
      } else {
        root.removeAttribute("data-force-portrait");
        root.style.removeProperty("--force-portrait-short");
        root.style.removeProperty("--force-portrait-long");
        root.style.removeProperty("--force-viewport-inset-left");
        root.style.removeProperty("--force-viewport-inset-top");
        root.style.removeProperty("--force-viewport-inset-right");
        root.style.removeProperty("--force-viewport-inset-bottom");
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
      root.style.removeProperty("--force-portrait-short");
      root.style.removeProperty("--force-portrait-long");
      root.style.removeProperty("--force-viewport-inset-left");
      root.style.removeProperty("--force-viewport-inset-top");
      root.style.removeProperty("--force-viewport-inset-right");
      root.style.removeProperty("--force-viewport-inset-bottom");
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
