import type { PuzzleMeta } from "../core/model";

export function PauseOverlay(props: {
  meta?: PuzzleMeta;
  sourceId?: string;
  started: boolean;
  onStart: () => void;
  onResume: () => void;
  onStayPaused: () => void;
  onRestart: () => void;
}) {
  const { meta, started } = props;
  const sourcePath = (props.sourceId ?? "").trim().replace(/^\/+/, "");
  const sudokuPadUrl = sourcePath ? `https://sudokupad.app/${encodeURI(sourcePath)}` : "";

  return (
    <div className="overlayBackdrop">
      <div className="card" style={{ width: "min(860px, 100%)", maxHeight: "min(92dvh, calc(100vh - 24px))", overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
          <div style={{ fontWeight: 800, fontSize: 22, minWidth: 0, overflowWrap: "anywhere" }}>{meta?.title || "(untitled)"}</div>
          {sudokuPadUrl ? (
            <a className="btn" href={sudokuPadUrl} target="_blank" rel="noopener noreferrer" title="Open on SudokuPad" aria-label="Open puzzle on SudokuPad" style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>SP</span>
              <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>↗</span>
            </a>
          ) : null}
        </div>
        <div className="muted" style={{ marginTop: 6 }}>{meta?.author || ""}</div>

        <div className="card" style={{ marginTop: 12, overflow: "auto", minHeight: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Instructions</div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
            {meta?.rules || "No instructions found in metadata."}
          </div>
        </div>

        {!started ? (
          <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={props.onStart}>
            Start
          </button>
        ) : (
          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn primary" style={{ flex: 1, minWidth: 0 }} onClick={props.onResume}>
              Resume
            </button>
            <button className="btn" style={{ flex: 1, minWidth: 0 }} onClick={props.onStayPaused}>
              Stay paused
            </button>
            <button className="btn" style={{ flex: 1, minWidth: 0 }} onClick={props.onRestart}>
              Restart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}