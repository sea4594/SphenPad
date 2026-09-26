import type { SudokuPadCompatibilityReport, SudokuPadDiagnosticCode } from "./warnings";
import { addSudokuPadDiagnostic } from "./warnings";

export function recordUnknownSudokuPadField(
  report: SudokuPadCompatibilityReport,
  code: SudokuPadDiagnosticCode,
  path: string,
  value: unknown,
): void {
  report.unknownFields[path] = (report.unknownFields[path] ?? 0) + 1;
  addSudokuPadDiagnostic(report, {
    severity: "warning",
    code,
    message: `Unknown SudokuPad field at ${path}`,
    path,
    value,
  });
}
