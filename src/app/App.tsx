import { useEffect } from "react";
import { Routes, Route, HashRouter, useLocation, useNavigate } from "react-router-dom";
import { MainMenu } from "../ui/MainMenu";
import { PuzzlePage } from "../ui/PuzzlePage";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { FoldersPage } from "../ui/FoldersPage";
import { PuzzleCreatorPage } from "../ui/PuzzleCreatorPage";
import { PuzzleEditorPage } from "../ui/PuzzleEditorPage";
import { AccountSyncProvider } from "./accountSync";
import { clearForcedPortrait } from "./forcedPortrait";
import { ThemeProvider } from "./theme";

const LAST_ROUTE_KEY = "sphenpad-last-route-v1";
const VIEWPORT_LOCKED_META = "width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content";
const VIEWPORT_REFRESH_DELAYS = [120, 320, 620] as const;
const MAIN_ROUTES = ["/", "/folders", "/archive"] as const;
type MainRoute = (typeof MAIN_ROUTES)[number];

function isMainRoute(path: string): path is MainRoute {
  return (MAIN_ROUTES as readonly string[]).includes(path);
}

function isRestorableRoute(path: string) {
  return isMainRoute(path) || path === "/creator" || path.startsWith("/p/") || path.startsWith("/creator/");
}

/**
 * Renders all three main pages simultaneously so they stay mounted and preserve
 * their state. Only the active page is interactive/visible; inactive pages stay
 * laid out in the background so puzzle previews remain warm.
 */
function MainPages() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname, search, hash } = location;

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

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div
        data-main-page-visible={pathname === "/" ? "true" : "false"}
        style={{
          position: "absolute",
          inset: 0,
          height: "100%",
          visibility: pathname === "/" ? "visible" : "hidden",
          pointerEvents: pathname === "/" ? "auto" : "none",
        }}
      >
        <MainMenu active={pathname === "/"} />
      </div>
      <div
        data-main-page-visible={pathname === "/folders" ? "true" : "false"}
        style={{
          position: "absolute",
          inset: 0,
          height: "100%",
          visibility: pathname === "/folders" ? "visible" : "hidden",
          pointerEvents: pathname === "/folders" ? "auto" : "none",
        }}
      >
        <FoldersPage active={pathname === "/folders"} />
      </div>
      <div
        data-main-page-visible={pathname === "/archive" ? "true" : "false"}
        style={{
          position: "absolute",
          inset: 0,
          height: "100%",
          visibility: pathname === "/archive" ? "visible" : "hidden",
          pointerEvents: pathname === "/archive" ? "auto" : "none",
        }}
      >
        <CtCArchivePage active={pathname === "/archive"} />
      </div>
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
      const width = Math.round(Math.max(1, viewport?.width ?? window.innerWidth));
      const height = Math.round(Math.max(1, viewport?.height ?? window.innerHeight));
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

    window.addEventListener("resize", scheduleViewportSync);
    window.addEventListener("orientationchange", scheduleViewportSync);
    orientation?.addEventListener("change", scheduleViewportSync);
    viewport?.addEventListener("resize", scheduleViewportSync);
    viewport?.addEventListener("scroll", scheduleViewportSync);
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
      orientation?.removeEventListener("change", scheduleViewportSync);
      viewport?.removeEventListener("resize", scheduleViewportSync);
      viewport?.removeEventListener("scroll", scheduleViewportSync);
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
                      <PuzzleCreatorPage />
                    </div>
                  )}
                />
                <Route
                  path="/creator/:puzzleId"
                  element={(
                    <div style={{ height: "100%", pointerEvents: "auto" }}>
                      <PuzzleEditorPage />
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
