import type { CreatorInterchangeReport, CreatorImportResult } from "./interchange";
import { creatorProjectFromDefinition, definitionFromCreatorProject, type CreatorProject } from "./project";

/** Creator-only preview; does not mutate or persist the imported project. */
export type CreatorImportPreview = {
  title: string;
  dimensions: string;
  givens: number;
  constraints: number;
  graphics: number;
  warnings: number;
  losses: number;
};

export const MAX_CREATOR_IMPORT_CHARACTERS = 10_000_000;

export function summarizeCreatorImport(result: CreatorImportResult): CreatorImportPreview {
  const { def, report } = result;
  const scene = def.scene;
  return {
    title: def.meta.title?.trim() || "Untitled puzzle",
    dimensions: `${def.rows} × ${def.cols}`,
    givens: def.givens.length,
    constraints: (def.logic?.constraints ?? []).length,
    graphics: (scene?.underlays.length ?? 0) + (scene?.overlays.length ?? 0) +
      (scene?.lines.length ?? 0) + (scene?.arrows.length ?? 0) + (scene?.cages.length ?? 0),
    warnings: report.issues.filter((item) => item.severity === "warning").length,
    losses: report.issues.filter((item) => item.severity === "loss").length,
  };
}

export function creatorExportLossWarning(report: CreatorInterchangeReport): string | null {
  const losses = report.issues.filter((item) => item.severity === "loss");
  if (losses.length) {
    const semantics = losses.some((item) => item.code === "creator-checker-semantics-not-exported");
    return `${semantics ? "IMPORTANT: This SudokuPad link may show the constraints without enforcing the original checker rules. " : ""}This export loses creator information (${losses.length} reported loss${losses.length === 1 ? "" : "es"}). Review the report before sharing. Continue?`;
  }
  if (report.issues.some((item) => item.code === "creator-checker-semantics-not-exported")) {
    return "This link includes the puzzle artwork but not all SphenPad creator-specific checker rules. Review the export report before sharing. Continue?";
  }
  return null;
}

/** New imports get a new identity and remain unpublished; the current project is untouched. */
export function creatorProjectForNewImport(result: CreatorImportResult, newKey: string): CreatorProject {
  const rekeyed = definitionFromCreatorProject(creatorProjectFromDefinition(result.def), { id: newKey, sourceId: newKey });
  return creatorProjectFromDefinition({ ...rekeyed, meta: { ...rekeyed.meta, creatorPublished: false } });
}
