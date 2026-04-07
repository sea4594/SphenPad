import { useEffect, useRef, useState } from "react";

type PopupMenuLeafItem = {
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

type PopupMenuItem = PopupMenuLeafItem & {
  submenu?: Array<{
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    tone?: "default" | "danger";
  }>;
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
  const [activeSubmenuLabel, setActiveSubmenuLabel] = useState<string | null>(null);
  const [activeSubmenuItems, setActiveSubmenuItems] = useState<PopupMenuLeafItem[] | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number }>({ left: 8, top: 8 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const estimatedItemCount = activeSubmenuItems ? activeSubmenuItems.length + 1 : items.length;

  const positionMenu = () => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const measuredWidth = menuRef.current?.offsetWidth ?? 220;
    const measuredHeight = menuRef.current?.offsetHeight ?? Math.max(estimatedItemCount, 1) * 44 + 16;

    const preferredLeft = triggerRect.right - measuredWidth;
    const preferredTop = triggerRect.bottom + 4;

    const maxLeft = Math.max(8, viewportWidth - measuredWidth - 8);
    const left = Math.max(8, Math.min(preferredLeft, maxLeft));

    const fitsBelow = preferredTop + measuredHeight <= viewportHeight - 8;
    const aboveTop = Math.max(8, triggerRect.top - measuredHeight - 4);
    const top = fitsBelow ? preferredTop : aboveTop;

    setMenuPos({ left, top });
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
        setActiveSubmenuItems(null);
        setActiveSubmenuLabel(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeSubmenuItems) {
          setActiveSubmenuItems(null);
          setActiveSubmenuLabel(null);
          return;
        }
        setOpen(false);
      }
    };

    const onResize = () => positionMenu();
    const onScroll = () => positionMenu();

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, activeSubmenuItems]);

  useEffect(() => {
    if (!open) return;
    positionMenu();
    const raf = window.requestAnimationFrame(() => positionMenu());
    return () => window.cancelAnimationFrame(raf);
  }, [open, activeSubmenuItems]);

  const menuItems: PopupMenuItem[] = activeSubmenuItems
    ? [
        {
          label: "Back",
          onSelect: () => {
            setActiveSubmenuItems(null);
            setActiveSubmenuLabel(null);
          },
        },
        ...activeSubmenuItems,
      ]
    : items;

  return (
    <div ref={rootRef} className="popupMenuRoot" onClick={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        className={className ?? "btn menuPuzzleWideButton menuPuzzleMoreButton"}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => {
            const next = !current;
            if (!next) {
              setActiveSubmenuItems(null);
              setActiveSubmenuLabel(null);
            }
            return next;
          });
        }}
        title={title}
        aria-label={ariaLabel}
        disabled={disabled}
        type="button"
      >
        <span aria-hidden>...</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="card menuPuzzleMoreMenu"
          style={{ position: "fixed", left: menuPos.left, top: menuPos.top }}
        >
          {activeSubmenuLabel ? <div className="muted" style={{ fontSize: 12 }}>{activeSubmenuLabel}</div> : null}
          {menuItems.map((item) => (
            <button
              key={`${activeSubmenuLabel ?? "root"}:${item.label}`}
              className={`btn menuPuzzleMoreItem ${item.tone === "danger" ? "danger" : ""}`}
              onClick={() => {
                if (item.disabled) return;
                if (item.submenu?.length) {
                  setActiveSubmenuLabel(item.label);
                  setActiveSubmenuItems(item.submenu);
                  return;
                }
                setOpen(false);
                setActiveSubmenuItems(null);
                setActiveSubmenuLabel(null);
                item.onSelect?.();
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