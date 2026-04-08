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
 * their state. Only the active page is visible; the others are hidden via
 * display:none (React state is fully preserved).
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
    <>
      <div style={{ display: pathname === "/" ? undefined : "none", height: "100%" }}>
        <MainMenu />
      </div>
      <div style={{ display: pathname === "/folders" ? undefined : "none", height: "100%" }}>
        <FoldersPage />
      </div>
      <div style={{ display: pathname === "/archive" ? undefined : "none", height: "100%" }}>
        <CtCArchivePage />
      </div>
    </>
  );
}

export function App() {
  useEffect(() => {
    const root = document.documentElement;
    clearForcedPortrait(root);
  }, []);

  return (
    <AccountSyncProvider>
      <ThemeProvider>
        <HashRouter>
          <Routes>
            <Route path="/p/:puzzleId" element={<PuzzlePage />} />
            <Route path="*" element={<MainPages />} />
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </AccountSyncProvider>
  );
}
