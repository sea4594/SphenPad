import { useEffect } from "react";
import type { PuzzleMeta } from "../core/model";
import { LinkifiedText } from "./LinkifiedText";

type CompletionOverlayProps = {
  meta?: PuzzleMeta;
  elapsed?: string;
  onClose: () => void;
};

export function CompletionOverlay(props: CompletionOverlayProps) {
  const { meta, elapsed, onClose } = props;
  const message = meta?.postSolveMessage?.trim() || "Great solve.";
  const showElapsed = Boolean(elapsed?.trim());
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
    <div className="overlayBackdrop">
      <div className="card" role="dialog" aria-modal="true" aria-label="Puzzle completion" style={{ width: "min(640px, 100%)", maxHeight: "min(92dvh, calc(100vh - 24px))", overflow: "auto" }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>Puzzle Complete</div>
        {showElapsed ? (
          <div className="muted" style={{ marginTop: 6 }}>
            Completed in <strong>{elapsed}</strong>
          </div>
        ) : null}
        {typeof meta?.solveCount === "number" ? (
          <div className="muted" style={{ marginTop: 4 }}>SudokuPad solves: {meta.solveCount.toLocaleString()}</div>
        ) : null}

        <div className="card" style={{ marginTop: 14 }}>
          <LinkifiedText className="linkifiedText" text={message} />
        </div>

        <button className="btn primary" style={{ width: "100%", marginTop: 14 }} onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}
