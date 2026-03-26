import { useCallback, useEffect } from "react";

type CheckAnswersOverlayProps = {
  correct: boolean;
  onClose: () => void;
};

export function CheckAnswersOverlay({ correct, onClose }: CheckAnswersOverlayProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="overlayBackdrop" onClick={onClose}>
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label="Check answers"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(360px, 100%)", textAlign: "center" }}
      >
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>
          {correct ? "👍 Looking good so far! 👍" : "😧 Uh, oh! 😧"}
        </div>
        <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>
          {correct
            ? "The digits you entered are correct."
            : "Did you miss some rules?"}
        </div>
        <button
          className="btn primary"
          style={{ width: "100%", marginTop: 18 }}
          onClick={onClose}
        >
          OK
        </button>
      </div>
    </div>
  );
}
