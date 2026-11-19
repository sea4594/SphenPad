import { lazy, Suspense, useDeferredValue, useEffect, useState } from "react";
import { Routes, Route, HashRouter, useLocation, useNavigate } from "react-router-dom";
import { PuzzlePage } from "../ui/PuzzlePage";
import { MainMenu } from "../ui/MainMenu";
import { FoldersPage } from "../ui/FoldersPage";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { AccountSyncProvider } from "./accountSync";
import { clearForcedPortrait } from "./forcedPortrait";
import { ThemeProvider } from "./theme";

// The puzzle can resume without downloading creator and library page modules.
const PuzzleCreatorPage = lazy(() => import("../ui/PuzzleCreatorPage").then((module) => ({ default: module.PuzzleCreatorPage })));
const PuzzleEditorPage = lazy(() => import("../ui/PuzzleEditorPage").then((module) => ({ default: module.PuzzleEditorPage })));

const LAST_ROUTE_KEY = "sphenpad-last-route-v1";
const VIEWPORT_LOCKED_META = "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content";
const VIEWPORT_REFRESH_DELAYS = [120, 320, 620, 1000, 1600] as const;
const MAIN_ROUTES = ["/", "/folders", "/archive"] as const;
type MainRoute = (typeof MAIN_ROUTES)[number];

function isMainRoute(path: string): path is MainRoute {
  return (MAIN_ROUTES as readonly string[]).includes(path);
}

function isRestorableRoute(path: string) {
  return isMainRoute(path) || path === "/creator" || path.startsWith("/p/") || path.startsWith("/creator/");
}

/**
 * Main pages mount when first visited, then remain mounted to preserve their
 * scroll positions, filters, previews, and local state. Hidden pages stay warm.
 * Only the active page is visible; its heavier refresh work can follow paint.
 */
function MainPages() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname, search, hash } = location;
  const [mountedMainPages, setMountedMainPages] = useState<MainRoute[]>([]);
  // Route visibility changes immediately. On a first visit, commit the empty
  // destination shell before mounting its potentially expensive page contents.
  const deferredPathname = useDeferredValue(pathname);
  const activeForWork = isMainRoute(pathname) ? deferredPathname : "";
  useEffect(() => {
    if (!isMainRoute(pathname) || mountedMainPages.includes(pathname)) return;
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setMountedMainPages((prev) => prev.includes(pathname) ? prev : [...prev, pathname]);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [pathname, mountedMainPages]);

  // On first mount: restore the last in-app route when the app opens at root.
  useEffect(() => {
    if (pathname !== "/") return;
    try {
      const saved = localStorage.getItem(LAST_ROUTE_KEY)?.trim() ?? "";
      if (saved && isRestorableRoute(saved) && saved !== "/") {
        navigate(saved, { replace: true });
      }
    } catch {
      // Silently ignore storage errors.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the current route (main pages and puzzle pages) for reopen restore.
  useEffect(() => {
    const route = `${pathname}${search}${hash}`;
    if (!isRestorableRoute(pathname)) return;
    try {
      localStorage.setItem(LAST_ROUTE_KEY, route);
    } catch {
      // Silently ignore storage errors.
    }
  }, [pathname, search, hash]);

  // A direct puzzle resume still avoids mounting any main page at startup.
  if (mountedMainPages.length === 0 && !isMainRoute(pathname)) return null;

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {(mountedMainPages.includes("/") || pathname === "/") && <div
        data-main-page-visible={pathname === "/" ? "true" : "false"}
        style={{
          position: "absolute",
          inset: 0,
          height: "100%",
          visibility: pathname === "/" ? "visible" : "hidden",
          pointerEvents: pathname === "/" ? "auto" : "none",
        }}
      >
        {mountedMainPages.includes("/") ? <Suspense fallback={null}><MainMenu active={activeForWork === "/"} /></Suspense> : null}
      </div>}
      {(mountedMainPages.includes("/folders") || pathname === "/folders") && <div
        data-main-page-visible={pathname === "/folders" ? "true" : "false"}
        style={{
          position: "absolute",
          inset: 0,
          height: "100%",
          visibility: pathname === "/folders" ? "visible" : "hidden",
          pointerEvents: pathname === "/folders" ? "auto" : "none",
        }}
      >
        {mountedMainPages.includes("/folders") ? <FoldersPage active={activeForWork === "/folders"} /> : null}
      </div>}
      {(mountedMainPages.includes("/archive") || pathname === "/archive") && <div
        data-main-page-visible={pathname === "/archive" ? "true" : "false"}
        style={{
          position: "absolute",
          inset: 0,
          height: "100%",
          visibility: pathname === "/archive" ? "visible" : "hidden",
          pointerEvents: pathname === "/archive" ? "auto" : "none",
        }}
      >
        {mountedMainPages.includes("/archive") ? <CtCArchivePage active={activeForWork === "/archive"} /> : null}
      </div>}
    </div>
  );
}

export function App() {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const orientation = window.screen.orientation;
    let rafId: number | null = null;
    const timeoutIds: number[] = [];

    const syncViewportSize = () => {
      const active = document.activeElement as HTMLElement | null;
      const editingText = Boolean(active && (active.matches("input, textarea, select") || active.isContentEditable));
      const visualWidth = viewport?.width ?? 0;
      const visualHeight = viewport?.height ?? 0;
      const layoutWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
      const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
      // iOS Safari can briefly retain the old visualViewport dimensions after
      // rotating back to portrait. Outside of keyboard editing, prefer the larger
      // layout measurement so the app cannot get stuck shorter than the screen.
      const width = Math.round(Math.max(1, editingText && visualWidth ? visualWidth : Math.max(visualWidth, layoutWidth)));
      const height = Math.round(Math.max(1, editingText && visualHeight ? visualHeight : Math.max(visualHeight, layoutHeight)));
      root.style.setProperty("--app-vw", `${width}px`);
      root.style.setProperty("--app-vh", `${height}px`);
    };

    const clearScheduledSync = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      for (const timeoutId of timeoutIds.splice(0)) {
        window.clearTimeout(timeoutId);
      }
    };

    const scheduleViewportSync = () => {
      clearScheduledSync();
      syncViewportSize();
      rafId = window.requestAnimationFrame(syncViewportSize);
      for (const delay of VIEWPORT_REFRESH_DELAYS) {
        timeoutIds.push(window.setTimeout(syncViewportSize, delay));
      }
    };

    scheduleViewportSync();

    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta?.getAttribute("content") !== VIEWPORT_LOCKED_META) {
      viewportMeta?.setAttribute("content", VIEWPORT_LOCKED_META);
    }

    const preventGestureZoom: EventListener = (event) => {
      event.preventDefault();
    };

    const preventTouchPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    const preventWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    const onVisibilityChange = () => { if (document.visibilityState === "visible") scheduleViewportSync(); };
    window.addEventListener("resize", scheduleViewportSync);
    window.addEventListener("orientationchange", scheduleViewportSync);
    window.addEventListener("focus", scheduleViewportSync);
    window.addEventListener("pageshow", scheduleViewportSync);
    document.addEventListener("visibilitychange", onVisibilityChange);
    orientation?.addEventListener("change", scheduleViewportSync);
    viewport?.addEventListener("resize", scheduleViewportSync);
    document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
    document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
    document.addEventListener("gestureend", preventGestureZoom, { passive: false });
    document.addEventListener("touchstart", preventTouchPinch, { passive: false });
    document.addEventListener("touchmove", preventTouchPinch, { passive: false });
    document.addEventListener("wheel", preventWheelZoom, { passive: false });

    return () => {
      clearScheduledSync();
      window.removeEventListener("resize", scheduleViewportSync);
      window.removeEventListener("orientationchange", scheduleViewportSync);
      window.removeEventListener("focus", scheduleViewportSync);
      window.removeEventListener("pageshow", scheduleViewportSync);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      orientation?.removeEventListener("change", scheduleViewportSync);
      viewport?.removeEventListener("resize", scheduleViewportSync);
      document.removeEventListener("gesturestart", preventGestureZoom);
      document.removeEventListener("gesturechange", preventGestureZoom);
      document.removeEventListener("gestureend", preventGestureZoom);
      document.removeEventListener("touchstart", preventTouchPinch);
      document.removeEventListener("touchmove", preventTouchPinch);
      document.removeEventListener("wheel", preventWheelZoom);
      root.style.removeProperty("--app-vw");
      root.style.removeProperty("--app-vh");
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    clearForcedPortrait(root);
  }, []);

  return (
    <AccountSyncProvider>
      <ThemeProvider>
        <HashRouter>
          <div style={{ position: "relative", height: "100%", width: "100%" }}>
            <MainPages />
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              <Routes>
                <Route
                  path="/creator"
                  element={(
                    <div style={{ height: "100%", pointerEvents: "auto" }}>
                      <Suspense fallback={null}><PuzzleCreatorPage /></Suspense>
                    </div>
                  )}
                />
                <Route
                  path="/creator/:puzzleId"
                  element={(
                    <div style={{ height: "100%", pointerEvents: "auto" }}>
                      <Suspense fallback={null}><PuzzleEditorPage /></Suspense>
                    </div>
                  )}
                />
                <Route
                  path="/p/:puzzleId"
                  element={(
                    <div style={{ height: "100%", pointerEvents: "auto" }}>
                      <PuzzlePage />
                    </div>
                  )}
                />
              </Routes>
            </div>
          </div>
        </HashRouter>
      </ThemeProvider>
    </AccountSyncProvider>
  );
}
