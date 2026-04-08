import { useEffect } from "react";
import { Routes, Route, HashRouter, Navigate } from "react-router-dom";
import { MainMenu } from "../ui/MainMenu";
import { PuzzlePage } from "../ui/PuzzlePage";
import { CtCArchivePage } from "../ui/CtCArchivePage";
import { FoldersPage } from "../ui/FoldersPage";
import { AccountSyncProvider } from "./accountSync";
import { clearForcedPortrait } from "./forcedPortrait";
import { ThemeProvider } from "./theme";

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
            <Route path="/" element={<MainMenu />} />
            <Route path="/folders" element={<FoldersPage />} />
            <Route path="/archive" element={<CtCArchivePage />} />
            <Route path="/p/:puzzleId" element={<PuzzlePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </AccountSyncProvider>
  );
}
