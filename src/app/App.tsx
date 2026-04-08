import { useEffect, useRef } from "react";
import { Route, Routes, HashRouter, useLocation, useNavigate } from "react-router-dom";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { FoldersPage } from "../ui/FoldersPage";
import { MainMenu } from "../ui/MainMenu";
import { PuzzlePage } from "../ui/PuzzlePage";
import { AccountSyncProvider, useAccountSync } from "./accountSync";
import { clearForcedPortrait } from "./forcedPortrait";
import { ThemeProvider } from "./theme";

const LAST_ROUTE_KEY = "sphenpad-last-route-v1";

function RoutePersistence() {
  const location = useLocation();
  const navigate = useNavigate();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    try {
      const saved = localStorage.getItem(LAST_ROUTE_KEY);
      if (!saved || location.pathname !== "/") return;
      if (saved === "/") return;
      navigate(saved, { replace: true });
    } catch {
      // Ignore localStorage read errors.
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_ROUTE_KEY, `${location.pathname}${location.search}${location.hash}`);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function MainPagesHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  useEffect(() => {
    if (path === "/" || path === "/folders" || path === "/archive") return;
    navigate("/", { replace: true });
  }, [navigate, path]);

  return (
    <>
      <div style={{ display: path === "/" ? "block" : "none" }} aria-hidden={path !== "/"}>
        <MainMenu isVisible={path === "/"} />
      </div>
      <div style={{ display: path === "/folders" ? "block" : "none" }} aria-hidden={path !== "/folders"}>
        <FoldersPage isVisible={path === "/folders"} />
      </div>
      <div style={{ display: path === "/archive" ? "block" : "none" }} aria-hidden={path !== "/archive"}>
        <CtCArchivePage isVisible={path === "/archive"} />
      </div>
    </>
  );
}

function AppRoutes() {
  const { ready, user } = useAccountSync();

  if (!ready) {
    return (
      <div className="shell">
        <div className="page" style={{ placeItems: "center" }}>
          <div className="card" style={{ width: "min(460px, 100%)", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Restoring account</div>
            <div className="muted" style={{ marginTop: 8 }}>
              {user ? "Loading your synced puzzles, folders, and settings..." : "Checking sign-in state..."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <HashRouter>
        <RoutePersistence />
        <Routes>
          <Route path="/p/:puzzleId" element={<PuzzlePage />} />
          <Route path="*" element={<MainPagesHost />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}

export function App() {
  useEffect(() => {
    const root = document.documentElement;
    clearForcedPortrait(root);
  }, []);

  return (
    <AccountSyncProvider>
      <AppRoutes />
    </AccountSyncProvider>
  );
}
