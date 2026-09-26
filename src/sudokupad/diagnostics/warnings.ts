export type SudokuPadDiagnosticSeverity = "info" | "warning" | "error";

export type SudokuPadDiagnosticCode =
  | "unknown-top-level-field"
  | "unknown-cell-field"
  | "unknown-cage-field"
  | "unknown-line-field"
  | "unknown-arrow-field"
  | "unknown-graphic-field"
  | "unknown-fpuzzles-key"
  | "unknown-feature"
  | "asset-load-failed"
  | "font-load-failed"
  | "unsupported-format"
  | "compatibility-fallback";

export interface SudokuPadDiagnostic {
  severity: SudokuPadDiagnosticSeverity;
  code: SudokuPadDiagnosticCode;
  message: string;
  path?: string;
  value?: unknown;
}

export interface SudokuPadCompatibilityReport {
  targetVersion: string;
  diagnostics: SudokuPadDiagnostic[];
  unknownFields: Record<string, number>;
}

export function createSudokuPadCompatibilityReport(targetVersion: string): SudokuPadCompatibilityReport {
  return {
    targetVersion,
    diagnostics: [],
    unknownFields: {},
  };
}

export function addSudokuPadDiagnostic(
  report: SudokuPadCompatibilityReport,
  diagnostic: SudokuPadDiagnostic,
): void {
  report.diagnostics.push(diagnostic);
}
