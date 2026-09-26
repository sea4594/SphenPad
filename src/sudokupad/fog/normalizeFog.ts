import type { SudokuPadPoint, SudokuPadSourcePuzzle, SudokuPadTriggerEffect } from "../types/source";
import type { SudokuPadFogDefinition, SudokuPadFogTriggerLink } from "../types/scene";

function resolveRcQuery(query: unknown, rows: number, cols: number): SudokuPadPoint[] {
  if (typeof query !== "string" || ["", "-", "none"].includes(query)) return [];
  const result: SudokuPadPoint[] = [];
  const normalized = query.replace(/[, ]+/g, "");
  const regex = /r(\d+)c(\d+)(?:-r(\d+)c(\d+))?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized))) {
    const r1 = Number(match[1]);
    const c1 = Number(match[2]);
    const r2 = Number(match[3] ?? r1);
    const c2 = Number(match[4] ?? c1);
    for (let c = c1; c <= c2; c += 1) {
      for (let r = r1; r <= r2; r += 1) {
        const row = r - 1;
        const col = c - 1;
        if (row >= 0 && row < rows && col >= 0 && col < cols) result.push([row, col]);
      }
    }
  }
  return result;
}

function topLeftCell(cells: SudokuPadPoint[]): SudokuPadPoint | undefined {
  return [...cells].sort(([r1, c1], [r2, c2]) => r1 === r2 ? c2 - c1 : r2 - r1).at(-1);
}

function normalizeTriggerLinks(effects: SudokuPadTriggerEffect[] | undefined, rows: number, cols: number): SudokuPadFogTriggerLink[] {
  return (effects ?? [])
    .filter((effect) => effect?.effect?.type === "foglight")
    .map(({ trigger, effect }) => ({
      triggerCells: resolveRcQuery(trigger?.cell ?? trigger?.cells, rows, cols),
      effectCells: resolveRcQuery(effect?.cells ?? effect?.cell, rows, cols),
    }));
}

/**
 * Port of FeatureFog.handleFogFeature. This intentionally mutates the cloned
 * source puzzle before ordinary cage/overlay normalization, just like SudokuPad.
 */
export function normalizeSudokuPadFogSource(source: SudokuPadSourcePuzzle, rows: number, cols: number): SudokuPadFogDefinition | undefined {
  const cages = source.cages ?? [];
  const overlays = source.overlays ?? [];
  let initialLightCells = Array.isArray(source.foglight) ? [...source.foglight] : undefined;

  [...cages].forEach((cage) => {
    if (cage.value === undefined && Array.isArray(cage.cells) && cage.cells.length > 0) {
      const labelCell = topLeftCell(cage.cells);
      if (labelCell) {
        const overlay = overlays.find((part) => {
          const center = part.center;
          return Array.isArray(center)
            && (center[0] | 0) === labelCell[0]
            && (center[1] | 0) === labelCell[1]
            && String(part.text ?? "").includes("FOGLIGHT");
        });
        if (overlay) {
          cage.value = "FOGLIGHT";
          overlays.splice(overlays.indexOf(overlay), 1);
        }
      }
    }

    const match = String(cage.value ?? "").match(/^FOGLIGHT$|^foglight:\s*(.+)/i);
    if (!match) return;
    cages.splice(cages.indexOf(cage), 1);
    const parsedCells = resolveRcQuery(match[1], rows, cols);
    initialLightCells = [...(initialLightCells ?? []), ...parsedCells, ...(cage.cells ?? [])];
  });

  const triggerLinks = normalizeTriggerLinks(source.triggereffect, rows, cols);
  if (triggerLinks.length > 0 && initialLightCells === undefined) initialLightCells = [];
  if (initialLightCells === undefined) return undefined;

  const dedupe = (points: SudokuPadPoint[]): SudokuPadPoint[] => {
    const seen = new Set<string>();
    return points.filter(([r, c]) => {
      const key = `${r},${c}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  return {
    initialLightCells: dedupe(initialLightCells),
    triggerEffects: JSON.parse(JSON.stringify(source.triggereffect ?? [])) as SudokuPadTriggerEffect[],
    triggerLinks,
  };
}
