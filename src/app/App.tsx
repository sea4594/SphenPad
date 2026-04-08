import { useEffect, useRef, type CSSProperties } from "react";
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

function MainPagesHost(props: { activePath: string }) {
  const { activePath } = props;
  const navigate = useNavigate();
  const isPuzzlePath = activePath.startsWith("/p/");
  const isMainPath = activePath === "/" || activePath === "/folders" || activePath === "/archive";

  useEffect(() => {
    if (isMainPath || isPuzzlePath) return;
    navigate("/", { replace: true });
  }, [isMainPath, isPuzzlePath, navigate]);

  const showMainMenu = !isPuzzlePath && activePath === "/";
  const showFolders = !isPuzzlePath && activePath === "/folders";
  const showArchive = !isPuzzlePath && activePath === "/archive";

  const layerStyle = (visible: boolean): CSSProperties => ({
    position: "absolute",
    inset: 0,
    visibility: visible ? "visible" : "hidden",
    pointerEvents: visible ? "auto" : "none",
    overflow: "hidden",
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 1 }}>
      <div style={layerStyle(showMainMenu)} aria-hidden={!showMainMenu}>
        <MainMenu isVisible={showMainMenu} />
      </div>
      <div style={layerStyle(showFolders)} aria-hidden={!showFolders}>
        <FoldersPage isVisible={showFolders} />
      </div>
      <div style={layerStyle(showArchive)} aria-hidden={!showArchive}>
        <CtCArchivePage isVisible={showArchive} />
      </div>
    </div>
  );
}

function MainPagesShell() {
  const location = useLocation();

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <RoutePersistence />
      <MainPagesHost activePath={location.pathname} />
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
        <Routes>
          <Route
            path="/p/:puzzleId"
            element={(
              <div style={{ width: "100%", height: "100%", pointerEvents: "auto" }}>
                <PuzzlePage />
              </div>
            )}
          />
        </Routes>
      </div>
    </div>
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
        <MainPagesShell />
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
