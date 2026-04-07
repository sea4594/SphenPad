import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SelectControlOption } from "./SelectControl";

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

export function MobileMultiSelectFilter(props: {
  label: string;
  searchPlaceholder: string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  options: SelectControlOption[];
  selectedValues: string[];
  onSelectedValuesChange: (values: string[]) => void;
  emptyText: string;
  summaryText: string;
}) {
  const {
    label,
    searchPlaceholder,
    searchQuery,
    onSearchQueryChange,
    options,
    selectedValues,
    onSelectedValuesChange,
    emptyText,
    summaryText,
  } = props;
  const [open, setOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  useEffect(() => {
    if (!open) return;

    const updateViewportHeight = () => {
      const visualHeight = window.visualViewport?.height;
      setViewportHeight(Math.round(visualHeight ?? window.innerHeight));
    };

    updateViewportHeight();

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const previousHtmlOverscroll = html.style.overscrollBehaviorY;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    html.style.overscrollBehaviorY = "none";

    return () => {
      visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);

      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.left = previousBody.left;
      body.style.right = previousBody.right;
      body.style.width = previousBody.width;
      body.style.overflow = previousBody.overflow;
      html.style.overscrollBehaviorY = previousHtmlOverscroll;
      window.scrollTo(0, scrollY);
      setViewportHeight(null);
    };
  }, [open]);

  const dialogStyle: CSSProperties | undefined = useMemo(() => {
    if (!viewportHeight) return undefined;
    const availableHeight = Math.max(260, viewportHeight - 24);
    return {
      height: `${Math.min(520, availableHeight)}px`,
      maxHeight: `${availableHeight}px`,
    };
  }, [viewportHeight]);

  return (
    <>
      <button className="btn mobileFilterTrigger" onClick={() => setOpen(true)} type="button">
        <span className="mobileFilterTriggerLabel">{label}</span>
        <span className="mobileFilterTriggerValue">{summaryText}</span>
      </button>

      {open ? (
        <div className="overlayBackdrop mobileFilterBackdrop" onClick={() => setOpen(false)}>
          <div className="card mobileFilterDialog" style={dialogStyle} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={label}>
            <div className="settingsHeader">
              <div style={{ fontWeight: 700, fontSize: 21 }}>{label}</div>
              <button className="btn" onClick={() => setOpen(false)} type="button">Close</button>
            </div>

            <input
              className="url"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              autoFocus
            />

            <div className="mobileFilterOptionList">
              {options.length ? options.map((option) => {
                const selected = selectedSet.has(option.value);
                return (
                  <button
                    key={option.value}
                    className={`mobileFilterOptionRow ${selected ? "is-selected" : ""}`}
                    onClick={() => onSelectedValuesChange(toggleValue(selectedValues, option.value))}
                    type="button"
                  >
                    <span className="mobileFilterOptionLabel">{option.label}</span>
                    <span className="mobileFilterOptionRight">
                      <span className="mobileFilterOptionMeta">{option.count ?? 0}</span>
                      <span className="mobileFilterOptionCheck" aria-hidden="true">{selected ? "●" : "○"}</span>
                    </span>
                  </button>
                );
              }) : (
                <div className="muted">{emptyText}</div>
              )}
            </div>

            <div className="row" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={() => onSelectedValuesChange([])} type="button">Clear</button>
              <button className="btn primary" onClick={() => setOpen(false)} type="button">Done</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}