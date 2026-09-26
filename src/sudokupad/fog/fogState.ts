import type { SudokuPadScene, SudokuPadSceneCell } from "../types/scene";
import type { SudokuPadPoint } from "../types/source";

function sceneCell(scene: SudokuPadScene, [row, col]: SudokuPadPoint): SudokuPadSceneCell | undefined {
  return scene.cells[row]?.[col];
}

function flatIndex(scene: SudokuPadScene, row: number, col: number): number {
  return row * scene.cols + col;
}

function isLamp(scene: SudokuPadScene, cell: SudokuPadSceneCell): boolean {
  const value = cell.value;
  if (value === undefined || value === "") return false;
  const solution = typeof scene.metadata.solution === "string" ? scene.metadata.solution : undefined;
  if (solution === undefined) return true;
  return String(value) === solution[flatIndex(scene, cell.row, cell.col)];
}

export function getSudokuPadLitCells(scene: SudokuPadScene): SudokuPadPoint[] {
  const fog = scene.fog;
  if (!fog) return [];
  const keys = new Set<string>();
  const add = (row: number, col: number) => {
    if (row < 0 || row >= scene.rows || col < 0 || col >= scene.cols) return;
    keys.add(`${row},${col}`);
  };
  fog.initialLightCells.forEach(([r, c]) => add(r, c));

  if ((fog.triggerLinks ?? []).length > 0) {
    for (const link of fog.triggerLinks ?? []) {
      const triggered = link.triggerCells
        .map((point) => sceneCell(scene, point))
        .filter((cell): cell is SudokuPadSceneCell => Boolean(cell))
        .map((cell) => isLamp(scene, cell))
        .every(Boolean);
      if (triggered) link.effectCells.forEach(([r, c]) => add(r, c));
    }
  } else {
    scene.cells.forEach((row) => row.forEach((cell) => {
      if (cell.value === undefined || cell.value === "") return;
      if (cell.given !== undefined) {
        // SudokuPad deep-fog behavior: re-entering the hidden given reveals only itself.
        if (String(cell.given) === String(cell.value)) add(cell.row, cell.col);
        return;
      }
      if (!isLamp(scene, cell)) return;
      for (let r = Math.max(0, cell.row - 1); r <= Math.min(scene.rows - 1, cell.row + 1); r += 1) {
        for (let c = Math.max(0, cell.col - 1); c <= Math.min(scene.cols - 1, cell.col + 1); c += 1) add(r, c);
      }
    }));
  }

  return [...keys].map((key) => key.split(",").map(Number) as SudokuPadPoint);
}

/** Update runtime clue visibility before cell text is rendered. */
export function applySudokuPadFogClueVisibility(scene: SudokuPadScene): void {
  if (!scene.fog) {
    scene.cells.forEach((row) => row.forEach((cell) => { delete cell.hideClue; }));
    return;
  }
  const lit = new Set(getSudokuPadLitCells(scene).map(([r, c]) => `${r},${c}`));
  scene.cells.forEach((row) => row.forEach((cell) => { cell.hideClue = !lit.has(`${cell.row},${cell.col}`); }));
}
