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
  const controlledValue = value == null ? "" : String(value);
  const selectedOption = options.find((entry) => entry.value === controlledValue) ?? options[0] ?? null;
  const canUseCustomMenu = forcedPortrait && !multiple && (size == null || size <= 1);

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

  const commitValue = (nextValue: string) => {
    if (!onChange || nextValue === controlledValue) return;
    const syntheticEvent = {
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as unknown as ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
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
        <span className="selectControlTriggerLabel">{selectedOption?.label ?? controlledValue}</span>
        <span className="selectControlCaret" aria-hidden="true">v</span>
      </button>

      {name ? <input type="hidden" name={name} value={controlledValue} /> : null}

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
              <button type="button" className="btn" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="selectControlOptionList" role="listbox" aria-label={dialogLabel}>
              {options.map((option) => {
                const isSelected = option.value === controlledValue;
                return (
                  <button
                    type="button"
                    key={option.value}
                    className={`btn selectControlOptionButton ${isSelected ? "primary" : ""}`}
                    onClick={() => {
                      commitValue(option.value);
                      setOpen(false);
                    }}
                    disabled={option.disabled}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}