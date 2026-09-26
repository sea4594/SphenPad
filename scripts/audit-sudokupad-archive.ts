import fs from "node:fs";
import path from "node:path";
import { loadResolvedSudokuPadPayload } from "../src/sudokupad/loader/importPuzzle";
import { emptySudokuPadUrlSettings, parseSudokuPadUrlSettings } from "../src/sudokupad/loader/urlSettings";

interface ArchiveRecord { sourceId: string; sudokuPadUrl?: string; payload: string }

const root = path.resolve(process.cwd(), "public/archive/puzzles");
const reportDir = path.resolve(process.cwd(), "reports");
fs.mkdirSync(reportDir, { recursive: true });

const stats = {
  total: 0, loaded: 0, failed: 0,
  rectangular: 0, non9x9: 0, outsideGridGraphics: 0,
  fog: 0, triggeredFog: 0, backgroundImages: 0,
  metadataGrids: 0, norowcol: 0,
  maxRows: 0, maxCols: 0,
};
const diagnostics = new Map<string, { count: number; examples: string[] }>();
const failures: Array<{ file: string; error: string }> = [];

for (const file of fs.readdirSync(root).filter((name) => name.endsWith(".json")).sort()) {
  stats.total += 1;
  try {
    const record = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as ArchiveRecord;
    let urlSettings = emptySudokuPadUrlSettings();
    if (record.sudokuPadUrl) {
      try { urlSettings = parseSudokuPadUrlSettings(new URL(record.sudokuPadUrl)); } catch { /* keep defaults */ }
    }
    const result = await loadResolvedSudokuPadPayload(record.payload, {
      context: { sourceId: record.sourceId, urlSettings },
    });
    const scene = result.scene;
    stats.loaded += 1;
    stats.maxRows = Math.max(stats.maxRows, scene.rows);
    stats.maxCols = Math.max(stats.maxCols, scene.cols);
    if (scene.rows !== scene.cols) stats.rectangular += 1;
    if (scene.rows !== 9 || scene.cols !== 9) stats.non9x9 += 1;
    const points = [
      ...scene.lines.flatMap((line) => line.wayPoints ?? []),
      ...scene.arrows.flatMap((arrow) => arrow.wayPoints ?? []),
      ...[...scene.underlays, ...scene.overlays].flatMap((part) => part.center ? [part.center] : []),
    ];
    if (points.some(([row, col]) => row < 0 || col < 0 || row > scene.rows || col > scene.cols)) stats.outsideGridGraphics += 1;
    if (scene.fog) {
      stats.fog += 1;
      if (scene.fog.triggerLinks?.length) stats.triggeredFog += 1;
    }
    if (scene.metadata.bgimage) stats.backgroundImages += 1;
    if (Array.isArray(scene.metadata.grids) && scene.metadata.grids.length) stats.metadataGrids += 1;
    if (scene.metadata.norowcol !== undefined) stats.norowcol += 1;

    for (const diagnostic of result.compatibility.diagnostics) {
      const key = `${diagnostic.code}|${diagnostic.path ?? ""}`;
      const row = diagnostics.get(key) ?? { count: 0, examples: [] };
      row.count += 1;
      if (row.examples.length < 5) row.examples.push(file);
      diagnostics.set(key, row);
    }
  } catch (error) {
    stats.failed += 1;
    failures.push({ file, error: error instanceof Error ? error.stack ?? error.message : String(error) });
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  stats,
  diagnostics: Object.fromEntries([...diagnostics.entries()].sort((a, b) => b[1].count - a[1].count)),
  failures,
};
fs.writeFileSync(path.join(reportDir, "sudokupad-archive-audit.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify(stats, null, 2));
if (failures.length) process.exitCode = 1;
