import { useEffect } from "react";
import { Routes, Route, HashRouter, useLocation, useNavigate } from "react-router-dom";
import { MainMenu } from "../ui/MainMenu";
import { PuzzlePage } from "../ui/PuzzlePage";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { FoldersPage } from "../ui/FoldersPage";
import { AccountSyncProvider } from "./accountSync";
import { clearForcedPortrait } from "./forcedPortrait";
import { ThemeProvider } from "./theme";

const LAST_PAGE_KEY = "sphenpad-last-main-page-v1";
const MAIN_ROUTES = ["/", "/folders", "/archive"] as const;
type MainRoute = (typeof MAIN_ROUTES)[number];

function isMainRoute(path: string): path is MainRoute {
  return (MAIN_ROUTES as readonly string[]).includes(path);
}

/**
 * Renders all three main pages simultaneously so they stay mounted and preserve
 * their state. Only the active page is interactive/visible; inactive pages stay
 * laid out in the background so puzzle previews remain warm.
 */
function MainPages() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname } = location;

  // On first mount: restore last-visited page when the app opens at the root.
  useEffect(() => {
    if (pathname !== "/") return;
    try {
      const saved = localStorage.getItem(LAST_PAGE_KEY);
      if (saved && isMainRoute(saved) && saved !== "/") {
        navigate(saved, { replace: true });
      }
    } catch {
      // Silently ignore storage errors.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the current main page so we can restore it when the app reopens.
  useEffect(() => {
    if (!isMainRoute(pathname)) return;
    try {
      localStorage.setItem(LAST_PAGE_KEY, pathname);
    } catch {
      // Silently ignore storage errors.
    }
  }, [pathname]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div
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

    const syncViewportHeight = () => {
      const viewport = window.visualViewport;
      const height = Math.max(window.innerHeight, viewport?.height ?? 0);
      root.style.setProperty("--app-vh", `${Math.round(height)}px`);
    };

    syncViewportHeight();

    const viewport = window.visualViewport;
    window.addEventListener("resize", syncViewportHeight);
    window.addEventListener("orientationchange", syncViewportHeight);
    viewport?.addEventListener("resize", syncViewportHeight);
    viewport?.addEventListener("scroll", syncViewportHeight);

    return () => {
      window.removeEventListener("resize", syncViewportHeight);
      window.removeEventListener("orientationchange", syncViewportHeight);
      viewport?.removeEventListener("resize", syncViewportHeight);
      viewport?.removeEventListener("scroll", syncViewportHeight);
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
