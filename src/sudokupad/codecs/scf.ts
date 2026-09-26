import type { SudokuPadSourcePuzzle } from "../types/source";

export function codoku(value: string): string {
  return value.replace(/.0{0,5}/g, (chunk) => String.fromCharCode((Number(chunk[0]) + 10 * chunk.length) + ((Number(chunk[0]) + 10 * chunk.length) < 20 ? 38 : (Number(chunk[0]) + 10 * chunk.length) < 46 ? 45 : 51)));
}

export function dedoku(value: string): string {
  return value.replace(/./g, (char) => {
    const code = char.charCodeAt(0) - (char > "Z" ? 61 : char > "9" ? 55 : 48);
    return `${code % 10}${"0".repeat(code / 10)}`;
  });
}

function addMetadata(puzzle: SudokuPadSourcePuzzle, key: string, value: unknown): void {
  if (value === undefined) return;
  if (!puzzle.metadata) puzzle.metadata = {};
  const metadata = puzzle.metadata as Record<string, unknown>;
  if (metadata[key] === undefined) metadata[key] = value;
  else {
    if (!Array.isArray(metadata[key])) metadata[key] = [metadata[key]];
    (metadata[key] as unknown[]).push(value);
  }
}

function addGivens(puzzle: SudokuPadSourcePuzzle, givens = ""): void {
  puzzle.cells = [];
  puzzle.regions = [];
  for (let r = 0; r < 9; r += 1) {
    puzzle.cells[r] = [];
    puzzle.regions[r] = [];
    for (let c = 0; c < 9; c += 1) {
      const cell: Record<string, unknown> = {};
      puzzle.cells[r][c] = cell;
      puzzle.regions[r][c] = [Math.floor(r / 3) * 3 + Math.floor(c / 3), (r * 3) % 9 + c % 3];
      const given = givens[r * 9 + c];
      if (given === undefined) continue;
      const digit = Number(given);
      if (digit !== 0) cell.value = digit;
    }
  }
}

function addConstraints(puzzle: SudokuPadSourcePuzzle, constraints = ""): void {
  let i = 0;
  while (i < constraints.length) {
    const code = constraints[i++];
    switch (code) {
      case "w":
        puzzle.underlays ??= [];
        ([[2.5, 2.5], [2.5, 6.5], [6.5, 2.5], [6.5, 6.5]] as [number, number][]).forEach((center) => puzzle.underlays!.push({ center, width: 3, height: 3, backgroundColor: "#CFCFCF" }));
        addMetadata(puzzle, "rules", "Windoku: there are 4 indicated additional 3x3 regions.");
        puzzle.windoku = true;
        break;
      case "x":
        puzzle.lines ??= [];
        puzzle.lines.push({ color: "#34BBE6", thickness: 2, wayPoints: [[0, 0], [9, 9]] });
        puzzle.lines.push({ color: "#34BBE6", thickness: 2, wayPoints: [[0, 9], [9, 0]] });
        addMetadata(puzzle, "rules", "X-sudoku: digits cannot repeat along major diagonals.");
        puzzle["diagonal+"] = true;
        puzzle["diagonal-"] = true;
        break;
      case "a":
      case "t": {
        let j = i - 1;
        while (j++ < constraints.length) {
          if (constraints[j] === "*" && constraints[j + 1] === "*") { j += 1; continue; }
          if (constraints[j] === "*") break;
        }
        const value = constraints.slice(i, j).replace(/\*\*/g, "*");
        addMetadata(puzzle, code === "a" ? "author" : "title", value);
        i += value.length + 1;
        break;
      }
      default:
        break;
    }
  }
}

function puzzleType(puzzle: SudokuPadSourcePuzzle): "x4q" | "windoku" | "xsudoku" | "diagonal" | "classic" | false {
  const dpos = puzzle["diagonal+"] === true;
  const dneg = puzzle["diagonal-"] === true;
  const diagonal = dpos || dneg;
  const xsudoku = dpos && dneg;
  const windoku = puzzle.windoku === true;
  if (windoku && xsudoku) return "x4q";
  if (windoku && !diagonal) return "windoku";
  if (xsudoku && !windoku) return "xsudoku";
  if (diagonal) return "diagonal";
  if (!windoku && !diagonal) return "classic";
  return false;
}

const TYPE_TITLES = {
  x4q: "X4Q-Sudoku",
  windoku: "Windoku",
  xsudoku: "X-Sudoku",
  diagonal: "Diagonal Sudoku",
  classic: "Classic Sudoku",
} as const;

/** Port of PuzzleTools.decodeSCF in the captured build. Solver-derived solution is intentionally omitted. */
export function decodeScfPayload(input: string): SudokuPadSourcePuzzle {
  const scf = input.replace(/^scf/, "");
  const puzzle: SudokuPadSourcePuzzle = { id: input, cells: [] };
  const match = scf.match(/^([^*]*)\*?(.*)$/) ?? [];
  const scfData = match[1] ?? "";
  let constraints = match[2] ?? "";
  let givens = dedoku(scfData);
  if (!scf.includes("*")) {
    givens = givens.slice(0, 81);
    constraints = scfData.replace(new RegExp(`^${codoku(givens)}`), "");
  }
  addGivens(puzzle, givens);
  addMetadata(puzzle, "rules", "Normal sudoku rules apply.");
  addConstraints(puzzle, constraints);
  if (puzzle.metadata?.author === undefined) addMetadata(puzzle, "author", "SCF import");
  if (puzzle.metadata?.title === undefined) {
    const type = puzzleType(puzzle);
    if (type) addMetadata(puzzle, "title", TYPE_TITLES[type]);
  }
  return puzzle;
}
