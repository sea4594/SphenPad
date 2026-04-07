import { useMemo, useState } from "react";
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

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  return (
    <>
      <button className="btn mobileFilterTrigger" onClick={() => setOpen(true)} type="button">
        <span className="mobileFilterTriggerLabel">{label}</span>
        <span className="mobileFilterTriggerValue">{summaryText}</span>
      </button>

      {open ? (
        <div className="overlayBackdrop" onClick={() => setOpen(false)}>
          <div className="card mobileFilterDialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={label}>
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
                    className={`btn mobileFilterOption ${selected ? "primary" : ""}`}
                    onClick={() => onSelectedValuesChange(toggleValue(selectedValues, option.value))}
                    type="button"
                  >
                    <span className="mobileFilterOptionLabel">{option.label}</span>
                    <span className="mobileFilterOptionMeta">{option.count ?? 0}</span>
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