import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

type SelectControlProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

type OptionEntry = {
  value: string;
  label: ReactNode;
  disabled: boolean;
};

function toValueArray(
  value: SelectHTMLAttributes<HTMLSelectElement>["value"],
  multiple: boolean | undefined
): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (multiple) return [String(value)];
  return [String(value)];
}

function readOptionEntries(children: ReactNode): OptionEntry[] {
  const entries: OptionEntry[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== "option") return;
    const optionProps = child.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
    };
    const rawValue = optionProps.value;
    const value = rawValue == null ? "" : String(rawValue);
    entries.push({
      value,
      label: optionProps.children,
      disabled: !!optionProps.disabled,
    });
  });
  return entries;
}

function useForcedPortraitMode(): boolean {
  const [forcedPortrait, setForcedPortrait] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.hasAttribute("data-force-portrait");
  });

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setForcedPortrait(root.hasAttribute("data-force-portrait"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-force-portrait"],
    });
    return () => observer.disconnect();
  }, []);

  return forcedPortrait;
}

export function SelectControl({
  children,
  className,
  value,
  onChange,
  disabled,
  multiple,
  size,
  name,
  id,
  "aria-label": ariaLabel,
  ...rest
}: SelectControlProps) {
  const forcedPortrait = useForcedPortraitMode();
  const [open, setOpen] = useState(false);
  const options = useMemo(() => readOptionEntries(children), [children]);
  const selectedValues = useMemo(() => toValueArray(value, multiple), [multiple, value]);
  const selectedValueSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const controlledValue = selectedValues[0] ?? "";
  const selectedOption = options.find((entry) => entry.value === controlledValue) ?? options[0] ?? null;
  const canUseCustomMenu = forcedPortrait;

  useEffect(() => {
    if (!canUseCustomMenu) setOpen(false);
  }, [canUseCustomMenu]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!canUseCustomMenu) {
    return (
      <select
        id={id}
        className={className}
        value={value}
        onChange={onChange}
        disabled={disabled}
        multiple={multiple}
        size={size}
        name={name}
        aria-label={ariaLabel}
        {...rest}
      >
        {children}
      </select>
    );
  }

  const triggerClassName = `${className ?? ""} selectControlButton`.trim();
  const dialogLabel = ariaLabel || "Choose an option";

  const selectedLabel = multiple
    ? (selectedValues.length ? `${selectedValues.length} selected` : "All")
    : (selectedOption?.label ?? controlledValue);

  const commitValue = (nextValue: string) => {
    if (!onChange || nextValue === controlledValue) return;
    const syntheticEvent = {
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as unknown as ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
  };

  const commitValues = (nextValues: string[]) => {
    if (!onChange) return;
    const selectedOptions = nextValues.map((entry) => ({ value: entry }));
    const syntheticEvent = {
      target: {
        value: nextValues[0] ?? "",
        selectedOptions,
      },
      currentTarget: {
        value: nextValues[0] ?? "",
        selectedOptions,
      },
    } as unknown as ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
  };

  const toggleMultiValue = (nextValue: string) => {
    const nextSet = new Set(selectedValueSet);
    if (nextSet.has(nextValue)) nextSet.delete(nextValue);
    else nextSet.add(nextValue);
    const nextValues = options
      .map((entry) => entry.value)
      .filter((entry) => nextSet.has(entry));
    commitValues(nextValues);
  };

  return (
    <>
      <button
        id={id}
        type="button"
        className={triggerClassName}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="selectControlTriggerLabel">{selectedLabel}</span>
        <span className="selectControlCaret" aria-hidden="true">v</span>
      </button>

      {name && !multiple ? <input type="hidden" name={name} value={controlledValue} /> : null}

      {open ? (
        <div className="overlayBackdrop selectControlBackdrop" onClick={() => setOpen(false)}>
          <div
            className="card selectControlSheet"
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row selectControlHeader">
              <div className="menuSectionTitle selectControlTitle">{dialogLabel}</div>
              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                {multiple ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => commitValues([])}
                    disabled={selectedValues.length < 1}
                  >
                    Clear
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={() => setOpen(false)}>Done</button>
              </div>
            </div>

            <div
              className="selectControlOptionList"
              role="listbox"
              aria-label={dialogLabel}
              aria-multiselectable={multiple ? true : undefined}
            >
              {options.map((option) => {
                const isSelected = multiple
                  ? selectedValueSet.has(option.value)
                  : option.value === controlledValue;
                return (
                  <button
                    type="button"
                    key={option.value}
                    className={`btn selectControlOptionButton ${isSelected ? "primary" : ""}`}
                    onClick={() => {
                      if (multiple) {
                        toggleMultiValue(option.value);
                        return;
                      }
                      commitValue(option.value);
                      setOpen(false);
                    }}
                    disabled={option.disabled}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {multiple ? (
                      <span className="selectControlOptionBody">
                        <span className={`selectControlOptionState ${isSelected ? "is-selected" : ""}`} aria-hidden="true" />
                        <span>{option.label}</span>
                      </span>
                    ) : option.label}
                  </button>
                );
              })}
              {!options.length ? <div className="muted">No options</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}