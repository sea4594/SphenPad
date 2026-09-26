import type { SudokuPadScene, SudokuPadSceneCell } from "../types/scene";
import { DEFAULT_SUDOKUPAD_RENDER_SETTINGS } from "../types/settings";

/** Hand-built Phase-2 smoke fixture. It deliberately exercises only native renderer primitives. */
export function createRendererSmokeScene(): SudokuPadScene {
  const cells: SudokuPadSceneCell[][] = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, col) => ({ row, col })));
  cells[0]![0]!.given = "1";
  cells[0]![1]!.givenCentremarks = ["2", "3"];
  cells[1]![1]!.givenCornermarks = ["1", "4"];
  return {
    version: 2,
    rows: 4,
    cols: 4,
    cells,
    regions: [
      { cells: [[0,0],[0,1],[1,0],[1,1]], style: "box" },
      { cells: [[0,2],[0,3],[1,2],[1,3]], style: "box" },
      { cells: [[2,0],[2,1],[3,0],[3,1]], style: "box" },
      { cells: [[2,2],[2,3],[3,2],[3,3]], style: "box" },
    ],
    cages: [{ cells: [[0,0],[0,1],[1,1]], value: "7", style: "killer" }],
    lines: [{ wayPoints: [[0.5,0.5],[1.5,1.5],[2.5,1.5]], color: "#cfcfcf", thickness: 12 }],
    arrows: [{ wayPoints: [[3.5,0.5],[2.5,0.5]], color: "#000000", thickness: 2, headLength: 0.3 }],
    underlays: [{ center: [2.5,2.5], width: 0.8, height: 0.8, rounded: true, backgroundColor: "#cfcfcf" }],
    overlays: [{ center: [1,2.5], width: 0.3, height: 0.3, rounded: true, borderColor: "#000", backgroundColor: "#fff", text: "1", fontSize: 12 }],
    metadata: { title: "Renderer smoke fixture" },
    renderSettings: { ...DEFAULT_SUDOKUPAD_RENDER_SETTINGS },
    unknown: {},
  };
}
