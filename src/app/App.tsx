import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, HashRouter, useLocation, useNavigate } from "react-router-dom";
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
