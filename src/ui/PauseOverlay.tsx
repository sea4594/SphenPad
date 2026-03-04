import type { PuzzleMeta } from "../core/model";

export function PauseOverlay(props: {
  meta?: PuzzleMeta;
  started: boolean;
  onStart: () => void;
  onResume: () => void;
  onStayPaused: () => void;
}) {
  const { meta, started } = props;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.72)",
        display: "grid",
        placeItems: "center",
        padding: 18,
        zIndex: 50,
      }}
    >
      <div className="card" style={{ width: "min(860px, 100%)" }}>
        <div style={{ fontWeight: 800, fontSize: 22 }}>{meta?.title || "(untitled)"}</div>
        <div className="muted" style={{ marginTop: 6 }}>{meta?.author || ""}</div>

        <div className="card" style={{ marginTop: 12 }}>
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
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" style={{ flex: 1 }} onClick={props.onResume}>
              Resume
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={props.onStayPaused}>
              Stay paused
            </button>
          </div>
        )}
      </div>
    </div>
  );
}