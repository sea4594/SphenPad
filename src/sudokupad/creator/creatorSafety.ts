import type { PuzzleDefinition } from "../../core/model";
import { getCreatorSolutionEntries } from "./gridStructure";
import { getCreatorRegions } from "./nativeAuthoring";

/** Describe potentially destructive creator structural changes without changing the renderer. */
export function describeCreatorStructureLoss(before: PuzzleDefinition, after: PuzzleDefinition): string[] {
  const warnings: string[] = [];
  const inBounds = (cell: { r: number; c: number }) => cell.r >= 0 && cell.c >= 0 && cell.r < after.rows && cell.c < after.cols;
  const lostGivens = before.givens.filter((item) => !inBounds(item.rc)).length;
  const lostSolution = getCreatorSolutionEntries(before).filter((item) => !inBounds(item.rc)).length;
  if (lostGivens) warnings.push(`${lostGivens} given${lostGivens === 1 ? "" : "s"}`);
  if (lostSolution) warnings.push(`${lostSolution} solution cell${lostSolution === 1 ? "" : "s"}`);
  const newIds = new Set((after.logic?.constraints ?? []).map((constraint) => constraint.id));
  const lostConstraints = (before.logic?.constraints ?? []).filter((constraint) => !newIds.has(constraint.id)).length;
  if (lostConstraints) warnings.push(`${lostConstraints} constraint${lostConstraints === 1 ? "" : "s"}`);
  const oldRegions = getCreatorRegions(before);
  const newRegions = getCreatorRegions(after);
  const regionSignature = (regions: typeof oldRegions) => regions.map((region) => region.cells.map((cell) => `${cell.r}:${cell.c}`).sort().join(",")).sort().join("|");
  if (oldRegions.length && regionSignature(oldRegions) !== regionSignature(newRegions)) warnings.push("the existing region layout");
  const lostCells = before.rows * before.cols - Math.min(before.rows, after.rows) * Math.min(before.cols, after.cols);
  if ((before.rows > after.rows || before.cols > after.cols) && lostCells) warnings.push("grid cells outside the new dimensions (including any per-cell artwork)");
  return warnings;
}
