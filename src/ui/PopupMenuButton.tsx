import { useEffect, useRef, useState } from "react";

type PopupMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

export function PopupMenuButton(props: {
  ariaLabel: string;
  title?: string;
  items: PopupMenuItem[];
  disabled?: boolean;
  className?: string;
}) {
  const { ariaLabel, title, items, disabled, className } = props;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="popupMenuRoot" onClick={(event) => event.stopPropagation()}>
      <button
        className={className ?? "btn menuPuzzleWideButton menuPuzzleMoreButton"}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        title={title}
        aria-label={ariaLabel}
        disabled={disabled}
        type="button"
      >
        <span aria-hidden>...</span>
      </button>

      {open ? (
        <div className="card menuPuzzleMoreMenu">
          {items.map((item) => (
            <button
              key={item.label}
              className={`btn menuPuzzleMoreItem ${item.tone === "danger" ? "danger" : ""}`}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onSelect();
              }}
              disabled={item.disabled}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}