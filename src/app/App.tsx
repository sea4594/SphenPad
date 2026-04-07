import { useEffect } from "react";
import { Navigate, Route, Routes, HashRouter } from "react-router-dom";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { FoldersPage } from "../ui/FoldersPage";
import { MainMenu } from "../ui/MainMenu";
import { PuzzlePage } from "../ui/PuzzlePage";
import { AccountSyncProvider, useAccountSync } from "./accountSync";
import { clearForcedPortrait } from "./forcedPortrait";
import { ThemeProvider } from "./theme";

function AppRoutes() {
  const { appStateNonce, ready, user } = useAccountSync();

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
    <ThemeProvider key={appStateNonce}>
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
