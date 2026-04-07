import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export type SelectControlOption = {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
};

type SelectControlCommonProps = {
  className?: string;
  options: SelectControlOption[];
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
};

type SingleSelectControlProps = SelectControlCommonProps & {
  multiple?: false;
  value: string;
  onValueChange: (value: string) => void;
};

type MultiSelectControlProps = SelectControlCommonProps & {
  multiple: true;
  value: string[];
  size?: number;
  onValuesChange: (values: string[]) => void;
};

type SelectControlProps = SingleSelectControlProps | MultiSelectControlProps;

function joinClassNames(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(" ");
}

export function SelectControl(props: SelectControlProps) {
  const {
    className,
    options,
    disabled,
    title,
    searchable: _searchable,
    searchPlaceholder: _searchPlaceholder,
  } = props;
  const ariaLabel = props["aria-label"];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const multiple = props.multiple === true;
  const selectedValues = multiple ? props.value : [props.value];

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  const selectedLabel = useMemo(() => {
    if (multiple) {
      if (!props.value.length) return options[0]?.label ?? "";
      if (props.value.length === 1) return options.find((option) => option.value === props.value[0])?.label ?? props.value[0];
      return `${props.value.length} selected`;
    }
    return options.find((option) => option.value === props.value)?.label ?? props.value;
  }, [multiple, options, props]);

  useEffect(() => {
    if (multiple || !open) return;

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
  }, [multiple, open]);

  const toggleMultipleValue = (value: string) => {
    if (!multiple) return;
    const nextValues = selectedSet.has(value)
      ? props.value.filter((entry) => entry !== value)
      : [...props.value, value];
    props.onValuesChange(nextValues);
  };

  const visibleRows = multiple ? Math.max(1, props.size ?? Math.min(Math.max(options.length, 4), 8)) : 0;

  return (
    <div
      ref={rootRef}
      className={joinClassNames(
        "selectControl",
        multiple ? "selectControl--multiple" : "selectControl--single",
        open && !multiple && "is-open",
        disabled && "is-disabled",
        className,
      )}
      style={multiple ? ({ ["--select-control-visible-rows" as const]: String(visibleRows) } as CSSProperties) : undefined}
    >
      {multiple ? (
        <div
          className="selectControlList"
          role="listbox"
          aria-label={ariaLabel}
          aria-multiselectable="true"
        >
          {options.map((option) => {
            const selected = selectedSet.has(option.value);
            return (
              <button
                key={option.value}
                className={joinClassNames(
                  "selectControlOption",
                  selected && "is-selected",
                  option.disabled && "is-disabled",
                )}
                onClick={() => {
                  if (disabled || option.disabled) return;
                  toggleMultipleValue(option.value);
                }}
                role="option"
                aria-selected={selected}
                disabled={disabled || option.disabled}
                title={option.label}
                type="button"
              >
                <span className="selectControlOptionLabel">{option.label}</span>
                {option.count != null ? <span className="selectControlOptionMeta">{option.count}</span> : null}
              </button>
            );
          })}
          {!options.length ? <div className="selectControlEmpty muted">No options</div> : null}
        </div>
      ) : (
        <>
          <button
            className="selectControlTrigger"
            onClick={() => {
              if (disabled) return;
              setOpen((current) => !current);
            }}
            aria-label={ariaLabel}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={disabled}
            title={title ?? selectedLabel}
            type="button"
          >
            <span className="selectControlTriggerLabel">{selectedLabel}</span>
            <span className="selectControlChevron" aria-hidden="true">▾</span>
          </button>
          {open ? (
            <div className="selectControlPopover" role="listbox" aria-label={ariaLabel}>
              {options.map((option) => {
                const selected = props.value === option.value;
                return (
                  <button
                    key={option.value}
                    className={joinClassNames(
                      "selectControlOption",
                      selected && "is-selected",
                      option.disabled && "is-disabled",
                    )}
                    onClick={() => {
                      if (disabled || option.disabled) return;
                      props.onValueChange(option.value);
                      setOpen(false);
                    }}
                    role="option"
                    aria-selected={selected}
                    disabled={disabled || option.disabled}
                    title={option.label}
                    type="button"
                  >
                    <span className="selectControlOptionLabel">{option.label}</span>
                    {option.count != null ? <span className="selectControlOptionMeta">{option.count}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}