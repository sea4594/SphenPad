import type { ReactNode, SelectHTMLAttributes } from "react";

type SelectControlProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
  // These props are accepted for API compatibility but ignored;
  // the native OS dropdown handles its own search/filtering.
  searchable?: boolean;
  searchPlaceholder?: string;
};

export function SelectControl({
  children,
  searchable: _searchable,
  searchPlaceholder: _searchPlaceholder,
  ...rest
}: SelectControlProps) {
  return <select {...rest}>{children}</select>;
}