import { useEffect } from "react";
import { useAccountSync } from "../app/accountSync";
import { useTheme, type ThemeColor } from "../app/theme";
import { SelectControl, type SelectControlOption } from "./SelectControl";

type ThemePreset = {
  id: string;
  label: string;
  mode: "light" | "dark";
  color: ThemeColor;
};

const themePresets: ThemePreset[] = [
  { id: "bw-light", label: "Light", mode: "light", color: "bw" },
  { id: "bw-dark", label: "Dark", mode: "dark", color: "bw" },
  { id: "clay-light", label: "Clay", mode: "light", color: "clay" },
  { id: "ocean-light", label: "Ocean (light)", mode: "light", color: "ocean" },
  { id: "ocean-dark", label: "Ocean (dark)", mode: "dark", color: "ocean" },
  { id: "forest-light", label: "Forest", mode: "light", color: "forest" },
  { id: "berry-light", label: "Berry", mode: "light", color: "berry" },
];

const themePresetOptions: SelectControlOption[] = themePresets.map((preset) => ({
  value: preset.id,
  label: preset.label,
}));

export function SettingsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
  const appCommitSha = __APP_COMMIT_SHA__ || "unknown";
  const {
    firebaseEnabled,
    login,
    loginPending,
    logout,
    syncError,
    syncStatus,
    user,
  } = useAccountSync();
  const {
    mode,
    color,
    hideTimer,
    outlineDigits,
    conflictChecker,
    setMode,
    setColor,
    setHideTimer,
    setOutlineDigits,
    setConflictChecker,
  } = useTheme();
  const activePreset = themePresets.find((preset) => preset.mode === mode && preset.color === color) ?? themePresets[0];

  const applyThemePreset = (presetId: string) => {
    const preset = themePresets.find((item) => item.id === presetId);
    if (!preset) return;
    setMode(preset.mode);
    setColor(preset.color);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="overlayBackdrop" onClick={onClose}>
      <div className="card settingsCard" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="settingsHeader">
          <div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>Settings</div>
            <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>Commit: {appCommitSha}</div>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="settingsSection">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Account</div>
          <div className="settingsAccountBlock">
            <div>
              <div style={{ fontWeight: 700 }}>{user ? (user.displayName || user.email || "Signed in") : "Not signed in"}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {!firebaseEnabled
                  ? "Google sync is disabled until Firebase env vars are configured."
                  : syncStatus === "syncing"
                    ? "Syncing your app data..."
                    : syncError
                      ? syncError
                      : user
                        ? "Your puzzles, folders, and settings sync to this Google account."
                        : "Sign in with Google to sync everything across devices."}
              </div>
            </div>
            <div className="settingsAccountActions">
              {user ? (
                <button className="btn" onClick={() => logout().catch((error) => alert(error instanceof Error ? error.message : String(error)))} type="button">
                  Logout
                </button>
              ) : (
                <button
                  className="btn primary"
                  disabled={!firebaseEnabled || syncStatus === "syncing" || loginPending}
                  onClick={() => login().catch((error) => alert(error instanceof Error ? error.message : String(error)))}
                  type="button"
                >
                  {loginPending ? "Opening Google..." : "Google login"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="settingsSection">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Theme</div>
          <SelectControl
            className="btn settingsThemeSelect"
            aria-label="Select app theme"
            value={activePreset.id}
            options={themePresetOptions}
            onValueChange={applyThemePreset}
          />

          <div className="settingsRow" style={{ marginTop: 4 }}>
            <div className="muted">Hide timer</div>
            <button
              className={"switch" + (hideTimer ? " is-on" : "")}
              onClick={() => setHideTimer(!hideTimer)}
              aria-label="Toggle live timer visibility"
            >
              <span className="switchThumb" />
            </button>
          </div>

          <div className="settingsRow" style={{ marginTop: 4 }}>
            <div className="muted">Outline digits</div>
            <button
              className={"switch" + (outlineDigits ? " is-on" : "")}
              onClick={() => setOutlineDigits(!outlineDigits)}
              aria-label="Toggle digit outline"
            >
              <span className="switchThumb" />
            </button>
          </div>

          <div className="settingsRow" style={{ marginTop: 4 }}>
            <div className="muted">Conflict checker</div>
            <button
              className={"switch" + (conflictChecker ? " is-on" : "")}
              onClick={() => setConflictChecker(!conflictChecker)}
              aria-label="Toggle conflict checker"
            >
              <span className="switchThumb" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
