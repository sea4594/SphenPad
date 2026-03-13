import { useEffect } from "react";
import { useTheme, type ThemeColor } from "../app/theme";

const themeChoices: Array<{ key: ThemeColor; label: string; preview: string[] }> = [
  { key: "bw", label: "Black & White", preview: ["#ffffff", "#b3b3b3", "#1f1f1f"] },
  { key: "ocean", label: "Ocean", preview: ["#8bc7ff", "#4c87d9", "#17345f"] },
  { key: "forest", label: "Forest", preview: ["#9ce8c1", "#4ea37a", "#1d4733"] },
  { key: "sepia", label: "Sepia Paper", preview: ["#f4ead5", "#c9aa7e", "#684f32"] },
  { key: "berry", label: "Berry", preview: ["#ffbfd8", "#cb5f93", "#4a213f"] },
];

export function SettingsOverlay(props: { onClose: () => void }) {
  const { onClose } = props;
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
          <div style={{ fontWeight: 800, fontSize: 22 }}>Settings</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="settingsSection">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Theme</div>

          <div className="settingsRow">
            <div className="muted">Light / Dark</div>
            <button
              className={"switch" + (mode === "dark" ? " is-on" : "")}
              onClick={() => setMode(mode === "dark" ? "light" : "dark")}
              aria-label="Toggle light and dark mode"
            >
              <span className="switchThumb" />
            </button>
          </div>

          <div className="themeGrid">
            {themeChoices.map((choice) => (
              <button
                key={choice.key}
                className={"themeChoice" + (choice.key === color ? " active" : "")}
                onClick={() => setColor(choice.key)}
              >
                <span>{choice.label}</span>
                <span className="themePreview">
                  {choice.preview.map((p) => (
                    <span key={p} style={{ background: p }} />
                  ))}
                </span>
              </button>
            ))}
          </div>

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
