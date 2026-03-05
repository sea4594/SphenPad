import type { PuzzleMeta } from "../core/model";

type CompletionOverlayProps = {
  meta?: PuzzleMeta;
  elapsed: string;
  onClose: () => void;
};

export function CompletionOverlay(props: CompletionOverlayProps) {
  const message = props.meta?.postSolveMessage?.trim() || "Great solve.";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(12, 20, 32, 0.82)",
        display: "grid",
        placeItems: "center",
        padding: 18,
        zIndex: 60,
      }}
    >
      <div className="card" style={{ width: "min(640px, 100%)" }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>Congratulations</div>
        <div className="muted" style={{ marginTop: 6 }}>
          Completed in <strong>{props.elapsed}</strong>
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{message}</div>
        </div>

        <button className="btn primary" style={{ width: "100%", marginTop: 14 }} onClick={props.onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}
