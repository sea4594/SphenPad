/* eslint-disable @typescript-eslint/no-explicit-any */

import { z } from "zod";
import { decompressFromBase64, decompressFromEncodedURIComponent } from "lz-string";
import { normalizePuzzleKey } from "./id";
import type { PuzzleDefinition, CellRC, PuzzleCosmetics } from "./model";

/**
 * SudokuPad has a public API endpoint used by their own tooling:
 * https://sudokupad.app/api/puzzle/<puzzleId> :contentReference[oaicite:1]{index=1}
 */
const DEV_API_BASE = "/sp-api/api/puzzle";
const PROD_PROXY_A = "https://api.codetabs.com/v1/proxy/?quest=https://sudokupad.app/api/puzzle";
const PROD_API_BASE = "https://api.allorigins.win/raw?url=https://sudokupad.app/api/puzzle";
const COUNTER_API_BASE = "https://api.sudokupad.com/counter";
const COUNTER_PROXY_A = "https://api.codetabs.com/v1/proxy/?quest=https://api.sudokupad.com/counter";
const COUNTER_PROXY_B = "https://api.allorigins.win/raw?url=https://api.sudokupad.com/counter";

export const SUDOKUPAD_IMPORT_REVISION = 6;

function timeout(ms: number) {
  return new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms));
}

function buildPuzzleApiUrls(sourceId: string): string[] {
  const encoded = sourceId.split("/").map(encodeURIComponent).join("/");

  // In local dev we have a Vite proxy that avoids CORS.
  const urls: string[] = [`${DEV_API_BASE}/${encoded}`];

  // In static hosting (GitHub Pages), sudokupad.app does not allow this origin,
  // so use a CORS-enabled passthrough endpoint.
  urls.push(`${PROD_PROXY_A}/${encoded}`);
  urls.push(`${PROD_API_BASE}/${encoded}`);
  return urls;
}

function buildCounterApiUrls(counterId: string): string[] {
  const encoded = encodeURIComponent(counterId);
  return [
    `${COUNTER_API_BASE}/${encoded}`,
    `${COUNTER_PROXY_A}/${encoded}`,
    `${COUNTER_PROXY_B}/${encoded}`,
  ];
}

function looksLikePuzzlePayload(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Reject obvious HTML fallback pages (common when proxy route misses in static hosting).
  if (/^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t)) return false;

  // Common compressed prefixes.
  if (/^(scl|ctc|fpuz|fpuzzles)/i.test(t)) return true;

  // JSON payloads.
  if (/^[[{]/.test(t)) return true;

  return false;
}

async function fetchPuzzlePayloadById(sourceId: string): Promise<string> {
  const urls = buildPuzzleApiUrls(sourceId);
  let lastErr: unknown = null;

  for (const url of urls) {
    try {
      const res = await Promise.race([fetch(url), timeout(12000)]) as Response;
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} while fetching puzzle payload`);
        continue;
      }
      const text = await res.text();
      if (looksLikePuzzlePayload(text)) {
        // Some proxy responses can truncate payloads; only accept parseable candidates.
        const candidateRaw = tryParseJson(text) ?? text;
        const candidateScl = coerceToScl(candidateRaw);
        if (candidateScl) return text;
      }
      lastErr = new Error("Unexpected non-puzzle payload from endpoint");
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Failed to fetch puzzle payload");
}

function parseSourceId(input: string): string {
  const s = input.trim();
  try {
    const u = new URL(s);
    // Accept sudokupad.app/<id> or .../#<id> etc.
    const path = u.pathname.replace(/^\/+/, "");
    const hash = u.hash.replace(/^#/, "");
    const qp = u.searchParams.get("load") ?? u.searchParams.get("puzzle") ?? "";
    return path || hash || qp || s;
  } catch {
    return s.replace(/^\/+/, "");
  }
}

function parseBoolish(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
  }
  return false;
}

function parseSourceDetails(input: string): { sourceId: string; noGrid: boolean } {
  const sourceId = parseSourceId(input);
  try {
    const u = new URL(input.trim());
    const noGrid =
      parseBoolish(u.searchParams.get("setting-nogrid")) ||
      parseBoolish(u.searchParams.get("setting_nogrid")) ||
      parseBoolish(u.searchParams.get("nogrid")) ||
      parseBoolish(u.searchParams.get("noGrid"));
    return { sourceId, noGrid };
  } catch {
    return { sourceId, noGrid: false };
  }
}

function fixURIComponentish(s: string): string {
  // SudokuPad links sometimes embed percent-escapes inconsistently.
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function tryParseJson(text: string): unknown | null {
  try { return JSON.parse(text); } catch { return null; }
}

function tryParseLooseObjectLiteral(text: string): unknown | null {
  // Some older SudokuPad payloads decode to JS object-literals with sparse arrays,
  // short keys (ce/re/...) and unquoted hex color tokens.
  try {
    let src = text;
    src = src.replace(/#([0-9A-Fa-f]{1,8})/g, '"#$1"');
    src = src.replace(
      /(stroke|color|lineColor|fill|fillColor|textColor|fontColor|c1|c2|c|backgroundColor|borderColor)\s*:\s*([A-Za-z0-9#]{1,12})(?=[,}\]])/g,
      (_m, key, val) => {
        const low = String(val).toLowerCase();
        if (low === "true" || low === "false" || low === "null" || low === "undefined") {
          return `${key}:${val}`;
        }
        const v = String(val).startsWith("#") ? val : `#${val}`;
        return `${key}:"${v}"`;
      }
    );
    return Function("f", "t", "n", "u", `return (${src})`)(false, true, null, undefined);
  } catch {
    return null;
  }
}

function tryParseAnySclString(text: string | null | undefined): unknown | null {
  if (typeof text !== "string" || !text.length) return null;
  return tryParseJson(text) ?? tryParseLooseObjectLiteral(text) ?? tryParseJson(decompressedFromMaybeZipped(text));
}

function decodeCompressedPayloadVariants(payload: string): string[] {
  const variants = new Set<string>();
  const enqueue = (v: string | null | undefined) => {
    if (typeof v !== "string") return;
    const s = v.trim();
    if (!s) return;
    variants.add(s);
  };

  enqueue(payload);
  enqueue(payload.replace(/ /g, "+"));
  try {
    const decoded = decodeURIComponent(payload);
    enqueue(decoded);
    enqueue(decoded.replace(/ /g, "+"));
  } catch {
    // keep other variants
  }

  const out: string[] = [];
  for (const candidate of variants) {
    out.push(candidate);
    const viaBase64 = decompressFromBase64(candidate);
    if (typeof viaBase64 === "string" && viaBase64.length) out.push(viaBase64);
    const viaEncoded = decompressFromEncodedURIComponent(candidate);
    if (typeof viaEncoded === "string" && viaEncoded.length) out.push(viaEncoded);
  }
  return out;
}

function normalizeCompactScl(input: any): any {
  if (!input || typeof input !== "object") return input;
  const scl = { ...input } as any;

  // Compact aliases used in older SudokuPad exports.
  if (!scl.cells && Array.isArray(scl.ce)) scl.cells = scl.ce;
  if (!scl.regions && Array.isArray(scl.re)) scl.regions = scl.re;
  if (!scl.cellSize && Number.isFinite(Number(scl.cs))) scl.cellSize = Number(scl.cs);
  if (!scl.lines && Array.isArray(scl.l)) scl.lines = scl.l;
  if (!scl.overlays && Array.isArray(scl.o)) {
    scl.overlays = scl.o;
    scl.__overlaysFromCompactAlias = true;
  }
  if (!scl.underlays && Array.isArray(scl.u)) scl.underlays = scl.u;
  if (!scl.arrow && Array.isArray(scl.a)) scl.arrow = scl.a;
  if (!scl.dots && Array.isArray(scl.d)) scl.dots = scl.d;
  if (!scl.cages && Array.isArray(scl.ca)) scl.cages = scl.ca;
  if (!scl.metadata && scl.md && typeof scl.md === "object") scl.metadata = scl.md;

  if (!scl.metadata) scl.metadata = {};

  // Some payloads encode title/author/rules as "key: value" strings inside cage-like arrays.
  const metadataFromCageLikeArrays = [input?.ca, input?.cages, scl?.ca, scl?.cages]
    .filter(Array.isArray)
    .flat() as any[];
  for (const item of metadataFromCageLikeArrays) {
    const rawValue =
      typeof item?.v === "string" ? item.v
      : typeof item?.value === "string" ? item.value
      : "";
    const m = rawValue.match(/^\s*(title|author|rules?)\s*:\s*([\s\S]+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if ((key === "rule" || key === "rules") && !scl.metadata.rules) scl.metadata.rules = value;
    if (key === "title" && !scl.metadata.title) scl.metadata.title = value;
    if (key === "author" && !scl.metadata.author) scl.metadata.author = value;
  }

  return scl;
}

// Minimal SCL shape (loose on purpose; cosmetics vary wildly).
const SclSchema = z.object({
  cellSize: z.number().optional(),
  metadata: z.any().optional(),
  cells: z.any().optional(),
  regions: z.any().optional(),
  cages: z.any().optional(),
  arrow: z.any().optional(),
  dots: z.any().optional(),
  underlay: z.any().optional(),
}).passthrough();

function asRC(rc: any): CellRC | null {
  if (Array.isArray(rc) && rc.length >= 2) {
    // Cell coordinate tuples in SCL compact arrays are row/col.
    const r = Number(rc[0]);
    const c = Number(rc[1]);
    if (Number.isFinite(r) && Number.isFinite(c)) return { r, c };
  }
  if (rc && typeof rc === "object") {
    if (typeof rc.r === "number" && typeof rc.c === "number") return { r: rc.r, c: rc.c };
    if (typeof rc.row === "number" && typeof rc.col === "number") return { r: rc.row, c: rc.col };
  }
  return null;
}

function asValue(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number") return String(v);
  return undefined;
}

function asPoint(pt: any): { x: number; y: number } | null {
  if (Array.isArray(pt) && pt.length >= 2) {
    // SudokuPad tuple coordinates are commonly row/col; map to canvas x/y.
    return { x: Number(pt[1]), y: Number(pt[0]) };
  }
  if (pt && typeof pt === "object") {
    if (typeof pt.x === "number" && typeof pt.y === "number") return { x: pt.x, y: pt.y };
  }
  return null;
}

function normalizeColorToken(v: any): string | undefined {
  if (typeof v !== "string") return undefined;
  let s = v.trim();
  // Loose-literal normalization can sometimes leave embedded quotes in color fields.
  s = s.replace(/^"+|"+$/g, "");
  if (s.startsWith("\\\"") && s.endsWith("\\\"")) s = s.slice(2, -2);
  s = s.replace(/^"+|"+$/g, "");
  if (!s) return undefined;

  const raw = s.startsWith("#") ? s.slice(1) : s;
  if (/^[0-9a-f]+$/i.test(raw)) {
    if (raw.length === 1) {
      // Compact exports sometimes use #F / #0 style grayscale shorthand.
      const ch = raw.toLowerCase();
      return `#${ch}${ch}${ch}${ch}${ch}${ch}`;
    }
    if (raw.length === 3 || raw.length === 4 || raw.length === 6 || raw.length === 8) return `#${raw}`;
  }

  return s;
}

function parseOpacityToken(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

function parseFiniteNumberToken(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function categorizeTarget(raw: unknown): "under" | "over" | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().toLowerCase();
  if (!t) return undefined;
  if (/(^|[^a-z])(over|overlay|front|foreground|above|top)([^a-z]|$)/.test(t)) return "over";
  if (/(^|[^a-z])(under|underlay|back|background|behind|below|bottom)([^a-z]|$)/.test(t)) return "under";
  return undefined;
}

function isNoStrokeToken(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim().replace(/^"+|"+$/g, "").toLowerCase();
  return s === "none" || s === "transparent";
}

function parseRcString(value: any): CellRC[] {
  if (typeof value !== "string") return [];
  const out: CellRC[] = [];
  const re = /r(\d+)c(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    const r = Number(m[1]) - 1;
    const c = Number(m[2]) - 1;
    if (Number.isFinite(r) && Number.isFinite(c)) out.push({ r, c });
  }
  return out;
}

function parseCellRefs(value: any): CellRC[] {
  if (Array.isArray(value)) {
    const out: CellRC[] = [];
    for (const item of value) {
      const direct = asRC(item);
      if (direct) {
        out.push(direct);
        continue;
      }
      if (typeof item === "string") out.push(...parseRcString(item));
    }
    return out;
  }
  if (typeof value === "string") return parseRcString(value);
  return [];
}

function pointsAlmostEqual(a: { x: number; y: number }, b: { x: number; y: number }, eps = 1e-6) {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function parseSvgPathToWayPoints(pathData: string, pxPerCell = 64): Array<{ x: number; y: number }> {
  const tokens = pathData.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens?.length) return [];

  const out: Array<{ x: number; y: number }> = [];
  const toGrid = (n: number) => n / pxPerCell;
  const readNum = (i: number) => Number.parseFloat(tokens[i] ?? "NaN");
  const isNum = (tk?: string) => tk != null && !/^[a-zA-Z]$/.test(tk);

  let i = 0;
  let cmd = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;

  while (i < tokens.length) {
    const tk = tokens[i] as string;
    if (/^[a-zA-Z]$/.test(tk)) {
      cmd = tk;
      i += 1;
    }
    if (!cmd) break;

    if (cmd === "M" || cmd === "m") {
      let first = true;
      while (i + 1 < tokens.length && isNum(tokens[i]) && isNum(tokens[i + 1])) {
        const nx = readNum(i);
        const ny = readNum(i + 1);
        i += 2;
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) break;
        cx = cmd === "m" ? cx + nx : nx;
        cy = cmd === "m" ? cy + ny : ny;
        if (first) {
          sx = cx;
          sy = cy;
          first = false;
        }
        out.push({ x: toGrid(cx), y: toGrid(cy) });
      }
      continue;
    }

    if (cmd === "L" || cmd === "l") {
      while (i + 1 < tokens.length && isNum(tokens[i]) && isNum(tokens[i + 1])) {
        const nx = readNum(i);
        const ny = readNum(i + 1);
        i += 2;
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) break;
        cx = cmd === "l" ? cx + nx : nx;
        cy = cmd === "l" ? cy + ny : ny;
        out.push({ x: toGrid(cx), y: toGrid(cy) });
      }
      continue;
    }

    if (cmd === "C" || cmd === "c") {
      while (
        i + 5 < tokens.length &&
        isNum(tokens[i]) && isNum(tokens[i + 1]) && isNum(tokens[i + 2]) &&
        isNum(tokens[i + 3]) && isNum(tokens[i + 4]) && isNum(tokens[i + 5])
      ) {
        const x1 = readNum(i);
        const y1 = readNum(i + 1);
        const x2 = readNum(i + 2);
        const y2 = readNum(i + 3);
        const x3 = readNum(i + 4);
        const y3 = readNum(i + 5);
        i += 6;
        if (![x1, y1, x2, y2, x3, y3].every(Number.isFinite)) break;
        const p0x = cx;
        const p0y = cy;
        const p1x = cmd === "c" ? cx + x1 : x1;
        const p1y = cmd === "c" ? cy + y1 : y1;
        const p2x = cmd === "c" ? cx + x2 : x2;
        const p2y = cmd === "c" ? cy + y2 : y2;
        const p3x = cmd === "c" ? cx + x3 : x3;
        const p3y = cmd === "c" ? cy + y3 : y3;
        const steps = 12;
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          out.push({
            x: toGrid(cubicAt(p0x, p1x, p2x, p3x, t)),
            y: toGrid(cubicAt(p0y, p1y, p2y, p3y, t)),
          });
        }
        cx = p3x;
        cy = p3y;
      }
      continue;
    }

    if (cmd === "Z" || cmd === "z") {
      out.push({ x: toGrid(sx), y: toGrid(sy) });
      continue;
    }

    // Unsupported command: consume one token to avoid stalling.
    i += 1;
  }

  return out;
}

function centerFromCells(cells: CellRC[]): { x: number; y: number } | null {
  if (!cells.length) return null;
  const sx = cells.reduce((acc, rc) => acc + (rc.c + 0.5), 0);
  const sy = cells.reduce((acc, rc) => acc + (rc.r + 0.5), 0);
  return { x: sx / cells.length, y: sy / cells.length };
}

function inferPuzzleShape(sclObj: any, givens: Array<{ rc: CellRC }>): { rows: number; cols: number } {
  const explicitRows =
    Number(sclObj?.rows) ||
    Number(sclObj?.height) ||
    Number(sclObj?.metadata?.rows) ||
    Number(sclObj?.metadata?.height) ||
    0;
  const explicitCols =
    Number(sclObj?.cols) ||
    Number(sclObj?.columns) ||
    Number(sclObj?.width) ||
    Number(sclObj?.metadata?.cols) ||
    Number(sclObj?.metadata?.columns) ||
    Number(sclObj?.metadata?.width) ||
    0;

  const fromCellsRows = Array.isArray(sclObj?.cells) ? sclObj.cells.length : 0;
  const fromCellsCols = Array.isArray(sclObj?.cells)
    ? Math.max(0, ...sclObj.cells.map((row: unknown) => (Array.isArray(row) ? row.length : 0)))
    : 0;

  const fromGridRows = Array.isArray(sclObj?.grid) ? sclObj.grid.length : 0;
  const fromGridCols = Array.isArray(sclObj?.grid)
    ? Math.max(0, ...sclObj.grid.map((row: unknown) => (Array.isArray(row) ? row.length : 0)))
    : 0;

  const fromGivenRows = givens.length ? Math.max(...givens.map((g) => g.rc.r)) + 1 : 0;
  const fromGivenCols = givens.length ? Math.max(...givens.map((g) => g.rc.c)) + 1 : 0;

  const regionCells = Array.isArray(sclObj?.regions)
    ? sclObj.regions.flatMap((r: any) => parseCellRefs(r))
    : [];
  const fromRegionRows = regionCells.length ? Math.max(...regionCells.map((rc: CellRC) => rc.r)) + 1 : 0;
  const fromRegionCols = regionCells.length ? Math.max(...regionCells.map((rc: CellRC) => rc.c)) + 1 : 0;

  const sizeLike =
    Number(sclObj?.size) ||
    Number(sclObj?.gridSize) ||
    Number(sclObj?.n) ||
    Number(sclObj?.metadata?.size) ||
    Number(sclObj?.metadata?.gridSize) ||
    Number(sclObj?.metadata?.n) ||
    0;

  const solution = typeof sclObj?.metadata?.solution === "string" ? sclObj.metadata.solution : "";
  const solutionSquare = solution.length > 0 ? Math.sqrt(solution.length) : 0;
  const squareFromSolution = Number.isInteger(solutionSquare) ? solutionSquare : 0;

  const rows = Math.max(fromCellsRows, fromGridRows, fromGivenRows, fromRegionRows, explicitRows, sizeLike, squareFromSolution, 1);
  const cols = Math.max(fromCellsCols, fromGridCols, fromGivenCols, fromRegionCols, explicitCols, sizeLike, squareFromSolution, 1);
  return { rows, cols };
}

function spanFromCells(cells: CellRC[]): { width: number; height: number } | null {
  if (!cells.length) return null;
  const cols = cells.map((rc) => rc.c);
  const rows = cells.map((rc) => rc.r);
  const minC = Math.min(...cols);
  const maxC = Math.max(...cols);
  const minR = Math.min(...rows);
  const maxR = Math.max(...rows);
  return { width: Math.max(0.2, maxC - minC + 1), height: Math.max(0.2, maxR - minR + 1) };
}

function inferPuzzleSize(sclObj: any, givens: Array<{ rc: CellRC }>): number {
  const metadataSolution = sclObj?.metadata?.solution;
  const fromSolution =
    typeof metadataSolution === "string" && metadataSolution.length > 0
      ? Math.sqrt(metadataSolution.length)
      : 0;

  const explicitSize =
    Number(sclObj?.size) ||
    Number(sclObj?.gridSize) ||
    Number(sclObj?.n) ||
    Number(sclObj?.metadata?.size) ||
    Number(sclObj?.metadata?.gridSize) ||
    Number(sclObj?.metadata?.n) ||
    0;

  const fromCells = Array.isArray(sclObj?.cells)
    ? Math.max(
        sclObj.cells.length,
        ...sclObj.cells.map((row: unknown) => (Array.isArray(row) ? row.length : 0))
      )
    : 0;

  const fromGrid = Array.isArray(sclObj?.grid)
    ? Math.max(
        sclObj.grid.length,
        ...sclObj.grid.map((row: unknown) => (Array.isArray(row) ? row.length : 0))
      )
    : 0;

  const fromGivenCoords = givens.length
    ? Math.max(...givens.map((g) => Math.max(g.rc.r, g.rc.c))) + 1
    : 0;

  const regionCells = Array.isArray(sclObj?.regions)
    ? sclObj.regions.flatMap((r: any) => parseCellRefs(r))
    : [];
  const fromRegionCoords = regionCells.length
    ? Math.max(...regionCells.map((rc: CellRC) => Math.max(rc.r, rc.c))) + 1
    : 0;

  const fromSolutionSquare = Number.isInteger(fromSolution) ? fromSolution : 0;
  // Avoid decorative/outside-grid cosmetics from inflating core grid size.
  const inferred = Math.max(fromCells, fromGrid, fromGivenCoords, fromRegionCoords, fromSolutionSquare, explicitSize);
  return inferred > 0 ? inferred : 9;
}

function standardSubgridForSize(n: number): { r: number; c: number } | null {
  if (n === 6) return { r: 2, c: 3 };
  if (n === 8) return { r: 2, c: 4 };
  if (n === 10) return { r: 2, c: 5 };
  if (n === 12) return { r: 3, c: 4 };
  const s = Math.sqrt(n);
  if (Number.isInteger(s)) return { r: s, c: s };
  return null;
}

function detectStandardSubgrid(sclObj: any, n: number): { r: number; c: number } | undefined {
  const candidate = standardSubgridForSize(n);
  if (!candidate) return undefined;

  const regionsRaw = Array.isArray(sclObj?.regions)
    ? sclObj.regions
    : Array.isArray(sclObj?.re)
      ? sclObj.re
      : null;
  if (!regionsRaw?.length) return undefined;

  const parsedRegions = regionsRaw
    .map((region: any) => parseCellRefs(region))
    .filter((cells: CellRC[]) => cells.length > 0);
  if (!parsedRegions.length) return undefined;

  const expectedRegionCount = (n / candidate.r) * (n / candidate.c);
  if (parsedRegions.length !== expectedRegionCount) return undefined;
  if (!parsedRegions.every((cells: CellRC[]) => cells.length === candidate.r * candidate.c)) return undefined;

  const canonical = (cells: CellRC[]) => cells
    .map((rc) => `${rc.r},${rc.c}`)
    .sort()
    .join("|");

  const actual = parsedRegions.map(canonical).sort();
  const expected: string[] = [];
  for (let br = 0; br < n; br += candidate.r) {
    for (let bc = 0; bc < n; bc += candidate.c) {
      const box: CellRC[] = [];
      for (let r = 0; r < candidate.r; r++) {
        for (let c = 0; c < candidate.c; c++) {
          box.push({ r: br + r, c: bc + c });
        }
      }
      expected.push(canonical(box));
    }
  }
  expected.sort();

  for (let i = 0; i < expected.length; i++) {
    if (expected[i] !== actual[i]) return undefined;
  }
  return candidate;
}

function parseSolveCount(...values: unknown[]): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
    if (typeof v === "string") {
      const digits = v.replace(/[^0-9]/g, "");
      if (!digits) continue;
      const n = Number.parseInt(digits, 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (s) return s;
  }
  return undefined;
}

function extractInlineMetadata(sclObj: any): { title?: string; author?: string; rules?: string } {
  const out: { title?: string; author?: string; rules?: string } = {};
  const entries = [sclObj?.ca, sclObj?.cages].filter(Array.isArray).flat() as any[];
  for (const item of entries) {
    const raw =
      typeof item?.v === "string" ? item.v
      : typeof item?.value === "string" ? item.value
      : "";
    const m = raw.match(/^\s*(title|author|rules?)\s*:\s*([\s\S]+)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase();
    const v = m[2].trim();
    if (!v) continue;
    if (k === "title" && !out.title) out.title = v;
    if (k === "author" && !out.author) out.author = v;
    if ((k === "rule" || k === "rules") && !out.rules) out.rules = v;
  }
  return out;
}

function extractRulesText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.replace(/<br\s*\/?\s*>/gi, "\n").trim();
    return normalized || undefined;
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((v) => extractRulesText(v))
      .filter((v): v is string => Boolean(v));
    if (!parts.length) return undefined;
    return parts.join("\n\n");
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidate =
      extractRulesText(obj.rules) ??
      extractRulesText(obj.rule) ??
      extractRulesText(obj.ruleset) ??
      extractRulesText(obj.description) ??
      extractRulesText(obj.instructions) ??
      extractRulesText(obj.text) ??
      extractRulesText(obj.value) ??
      extractRulesText(obj.content) ??
      extractRulesText(obj.body);
    if (candidate) return candidate;
  }

  return undefined;
}

function buildCounterId(author: string, title: string): string | undefined {
  const reCleanStr = /[^a-z0-9+_\-&!?.,:;/\\'"()]+/ig;
  const authorPart = author.replace(reCleanStr, "").toLowerCase();
  const titlePart = title.replace(reCleanStr, "").toLowerCase();
  if (!authorPart || !titlePart) return undefined;
  const counterId = `${authorPart}-${titlePart}`;
  const blocked = new Set([
    "author-title",
    "unknown-untitled",
    "unknown-classicsudoku",
    "jamessinclair-tbd",
    "unknown-namelesssudoku",
  ]);
  if (blocked.has(counterId)) return undefined;
  return counterId;
}

async function fetchSolveCountByCounterId(counterId: string): Promise<number | undefined> {
  const urls = buildCounterApiUrls(counterId);
  for (const url of urls) {
    try {
      const res = await Promise.race([fetch(url), timeout(12000)]) as Response;
      if (!res.ok) continue;
      const text = await res.text();
      const parsed = tryParseJson(text);
      const count = parseSolveCount(
        (parsed as { count?: unknown } | null)?.count,
        (parsed as { solves?: unknown } | null)?.solves,
        (parsed as { solveCount?: unknown } | null)?.solveCount,
        text,
      );
      if (count != null) return count;
    } catch {
      // try next fallback endpoint
    }
  }
  return undefined;
}

function inferredRulesFromCosmetics(cosmetics: PuzzleCosmetics): string {
  const lines: string[] = ["Normal Sudoku rules apply."];

  if (cosmetics.cages?.length) lines.push("Killer cages are present: digits in a cage sum to the clue and may not repeat within a cage.");
  if (cosmetics.arrows?.length) lines.push("Arrow constraints are present.");
  if (cosmetics.dots?.length) lines.push("Dot constraints are present between adjacent cells.");
  if (cosmetics.lines?.length) lines.push("Additional line constraints are present.");
  if (cosmetics.thermolines?.length) lines.push("Thermo constraints are present: values increase from bulb to tip.");
  if (cosmetics.whispers?.length || cosmetics.germanwhispers?.length) lines.push("Whisper-style line constraints are present.");
  if (cosmetics.palindromes?.length) lines.push("Palindrome lines are present.");
  if (cosmetics.renbanlines?.length) lines.push("Renban lines are present.");
  if (cosmetics.entropics?.length) lines.push("Entropic lines are present.");
  if (cosmetics.antiKnight) lines.push("Anti-knight constraint applies.");
  if (cosmetics.antiKing) lines.push("Anti-king constraint applies.");
  if (cosmetics.antiRook) lines.push("Anti-rook constraint applies.");

  if (lines.length === 1) {
    lines.push("No additional constraints were found in puzzle metadata.");
  }

  lines.push("(Auto-generated because this puzzle has no rules text in imported metadata.)");
  return lines.join("\n\n");
}

function isVeryLightColorToken(token: unknown): boolean {
  if (typeof token !== "string") return false;
  const s = token.trim().toLowerCase();
  if (s === "#fff" || s === "#ffff" || s === "#ffffff" || s === "#ffffffff") return true;
  const m = s.match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return false;
  const rgb = m[1].slice(0, 6);
  const r = Number.parseInt(rgb.slice(0, 2), 16);
  const g = Number.parseInt(rgb.slice(2, 4), 16);
  const b = Number.parseInt(rgb.slice(4, 6), 16);
  return r >= 245 && g >= 245 && b >= 245;
}

function normalizeLayerCosmeticsToGrid(
  cosmetics: PuzzleCosmetics,
  rows: number,
  cols: number,
): PuzzleCosmetics {
  const normalizeLayerArray = (
    items: PuzzleCosmetics["underlays"] | PuzzleCosmetics["overlays"] | undefined,
  ) => {
    if (!Array.isArray(items) || !items.length) return items;

    return items
      .map((item) => {
        if (!item || !item.center) return null;
        const text = item.text == null ? "" : String(item.text).trim();
        const hasText = text.length > 0;
        const hasFill = Boolean(item.color);
        const hasBorder = Boolean(item.borderColor) && (item.borderThickness ?? 1.4) > 0;
        const width = Number.isFinite(item.width) ? Number(item.width) : 0;
        const height = Number.isFinite(item.height) ? Number(item.height) : 0;
        const cx = Number(item.center.x);
        const cy = Number(item.center.y);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

        const halfW = Math.max(0, width / 2);
        const halfH = Math.max(0, height / 2);
        const right = cx + halfW;
        const left = cx - halfW;
        const top = cy - halfH;
        const bottom = cy + halfH;
        const fullyOutside = right <= 0 || left >= cols || bottom <= 0 || top >= rows;

        // Ignore tiny anti-alias crumbs fully outside the puzzle bounds.
        const outsideBothAxes = (cx < 0 || cx > cols) && (cy < 0 || cy > rows);
        const angle = Math.abs(Number(item.angle ?? 0));
        const isRotatedMarker = angle >= 1 && Math.abs((angle % 90) - 45) <= 1.5;
        const tinyCornerArtifact =
          !hasText &&
          (hasFill || hasBorder) &&
          Math.max(width, height) <= 0.22 &&
          fullyOutside &&
          outsideBothAxes &&
          !isRotatedMarker;
        if (tinyCornerArtifact) return null;

        // Drop oversized border-only light frames that create white halos.
        const centeredOnGrid = Math.abs(cx - cols / 2) <= 0.25 && Math.abs(cy - rows / 2) <= 0.25;
        const oversizedByOneCell =
          width >= cols + 0.75 &&
          width <= cols + 1.25 &&
          height >= rows + 0.75 &&
          height <= rows + 1.25;
        const whiteHaloFrame =
          !hasText &&
          !hasFill &&
          hasBorder &&
          centeredOnGrid &&
          oversizedByOneCell &&
          isVeryLightColorToken(item.borderColor);
        if (whiteHaloFrame) return null;

        return item;
      })
      .filter(Boolean) as typeof items;
  };

  return {
    ...cosmetics,
    underlays: normalizeLayerArray(cosmetics.underlays),
    overlays: normalizeLayerArray(cosmetics.overlays),
  };
}

export async function loadFromSudokuPad(inputUrlOrId: string): Promise<{ key: string; def: PuzzleDefinition; raw: any }> {
  const sourceDetails = parseSourceDetails(inputUrlOrId);
  const sourceIdRaw = sourceDetails.sourceId;
  const sourceId = fixURIComponentish(sourceIdRaw);

  let payloadText: string | null = null;
  let raw: any = null;

  // If it looks like embedded SCL/FPuz payload, decode locally.
  if (/^(scl|ctc|fpuz|fpuzzles)/.test(sourceId)) {
    payloadText = sourceId;
  } else {
    // Treat as short id and fetch from SudokuPad API.
    payloadText = await fetchPuzzlePayloadById(sourceId);
  }

  // Some API responses are already JSON; some are compressed strings.
  raw = tryParseJson(payloadText) ?? payloadText;

  // Canonicalize to “SCL object” (best-effort).
  const sclObj = coerceToScl(raw);

  const cosmetics = extractCosmetics(sclObj);
  if (sourceDetails.noGrid) cosmetics.gridVisible = false;
  const inlineMeta = extractInlineMetadata(sclObj);

  const title = firstNonEmptyString(
    sclObj?.metadata?.title,
    sclObj?.metadata?.name,
    sclObj?.metadata?.t,
    sclObj?.metadata?.puzzleTitle,
    sclObj?.title,
    sclObj?.name,
    sclObj?.puzzleTitle,
    inlineMeta.title,
  ) ?? "";

  const author = firstNonEmptyString(
    sclObj?.metadata?.author,
    sclObj?.metadata?.by,
    sclObj?.metadata?.creator,
    sclObj?.author,
    sclObj?.by,
    sclObj?.creator,
    inlineMeta.author,
  ) ?? "";

  const rules =
    extractRulesText(
      sclObj?.metadata?.rules ??
      sclObj?.metadata?.rule ??
      sclObj?.metadata?.description ??
      sclObj?.metadata?.ruleset ??
      sclObj?.rules ??
      sclObj?.rule ??
      sclObj?.description ??
      sclObj?.ruleset ??
      inlineMeta.rules
    ) ??
    inferredRulesFromCosmetics(cosmetics);

  const puzzleSolveCount = parseSolveCount(
    sclObj?.metadata?.solveCount,
    sclObj?.metadata?.solves,
    sclObj?.metadata?.solveCounter,
    sclObj?.metadata?.nbSolves,
    sclObj?.metadata?.numSolves,
    sclObj?.metadata?.solvecount,
    sclObj?.metadata?.nsolves,
    sclObj?.metadata?.stats?.solves,
    sclObj?.metadata?.stats?.solveCount,
    sclObj?.stats?.solves,
    sclObj?.stats?.solveCount,
  );

  const counterId = buildCounterId(author, title);
  const counterSolveCount = puzzleSolveCount == null && counterId
    ? await fetchSolveCountByCounterId(counterId)
    : undefined;

  const meta = {
    title,
    author,
    rules,
    postSolveMessage:
      sclObj?.metadata?.postSolveMessage ??
      sclObj?.metadata?.postsolve ??
      sclObj?.metadata?.successMessage ??
      sclObj?.metadata?.congrats ??
      sclObj?.metadata?.msgcorrect ??
      sclObj?.metadata?.messageAfterSolve ??
      "",
    solveCount: puzzleSolveCount ?? counterSolveCount,
  };

  const givens = extractGivens(sclObj);
  const shape = inferPuzzleShape(sclObj, givens);
  const size = Math.max(shape.rows, shape.cols, inferPuzzleSize(sclObj, givens));
  const subgrid = shape.rows === shape.cols ? detectStandardSubgrid(sclObj, size) : undefined;
  const normalizedCosmetics = normalizeLayerCosmeticsToGrid(cosmetics, shape.rows, shape.cols);

  if (normalizedCosmetics.gridVisible == null && Array.isArray(sclObj?.regions)) {
    const regionCells = sclObj.regions.flatMap((region: any) => parseCellRefs(region));
    if (regionCells.length) {
      const regionRows = Math.max(...regionCells.map((rc: CellRC) => rc.r)) + 1;
      const regionCols = Math.max(...regionCells.map((rc: CellRC) => rc.c)) + 1;
      const hasDenseCustomArtwork =
        (normalizedCosmetics.lines?.length ?? 0) > 0 ||
        ((normalizedCosmetics.overlays?.length ?? 0) + (normalizedCosmetics.underlays?.length ?? 0)) >= 20;
      if (hasDenseCustomArtwork && (regionRows < shape.rows || regionCols < shape.cols)) {
        normalizedCosmetics.gridVisible = false;
      }
    }
  }

  const key = normalizePuzzleKey(sourceId);
  const def: PuzzleDefinition = {
    id: key,
    sourceId,
    importRevision: SUDOKUPAD_IMPORT_REVISION,
    size,
    rows: shape.rows,
    cols: shape.cols,
    meta,
    givens,
    cosmetics: {
      ...normalizedCosmetics,
      ...(subgrid ? { subgrid } : {}),
    },
  };

  return { key, def, raw: sclObj ?? raw };
}

function coerceToScl(raw: any): any {
  // Case 1: already an object
  if (raw && typeof raw === "object") {
    const normalized = normalizeCompactScl(raw);
    const parsed = SclSchema.safeParse(normalized);
    if (parsed.success) return parsed.data;
    return normalized;
  }

  // Case 2: prefixed compressed payload: "scl<base64>"
  if (typeof raw === "string") {
    const s = raw.trim();

    const m = s.match(/^(scl|ctc|fpuz|fpuzzles)([\s\S]+)$/);
    if (m) {
      const variants = decodeCompressedPayloadVariants(m[2]);
      for (const candidate of variants) {
        const parsed = tryParseAnySclString(candidate);
        if (parsed) return normalizeCompactScl(parsed);
      }
    }

    // If it's plain JSON text
    const j = tryParseJson(s);
    if (j) return normalizeCompactScl(j);

    const jLoose = tryParseLooseObjectLiteral(s);
    if (jLoose) return normalizeCompactScl(jLoose);

    // Otherwise: best-effort — maybe already decompressed but still JSON-ish
    const j3 = tryParseJson(decompressedFromMaybeZipped(s));
    if (j3) return normalizeCompactScl(j3);
  }

  return null;
}

function decompressedFromMaybeZipped(s: string): string {
  // Placeholder: SudokuPad sometimes “zips” JSON into a denser ASCII form.
  // MVP: no-op; extend with their zipper if you want 1:1 compatibility.
  return s;
}

function extractGivens(scl: any): Array<{ rc: CellRC; v: string }> {
  const out: Array<{ rc: CellRC; v: string }> = [];
  const grids = [scl?.cells, scl?.grid].filter(Array.isArray);
  for (const cells of grids) {
    for (let r = 0; r < cells.length; r++) {
      const row = cells[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        const value =
          asValue(cell?.value ?? cell?.v ?? cell?.given ?? cell?.g ?? cell?.digit ?? cell?.d) ??
          (typeof cell === "string" && /^[1-9A-Za-z]$/.test(cell) ? cell : undefined) ??
          (typeof cell === "number" && Number.isFinite(cell) && cell > 0 ? String(cell) : undefined);
        if (value != null) out.push({ rc: { r, c }, v: value });
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((entry) => {
    const key = `${entry.rc.r},${entry.rc.c}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractCosmetics(scl: any): PuzzleCosmetics {
  const cosmetics: PuzzleCosmetics = {};
  const sourceCellSize = Number(scl?.cellSize);
  cosmetics.sourceCellSize = Number.isFinite(sourceCellSize) && sourceCellSize > 0 ? sourceCellSize : 64;
  const sourceUnitsPerCell = Number.isFinite(sourceCellSize) && sourceCellSize > 0 ? sourceCellSize : 64;
  const defaultThermoThickness = sourceUnitsPerCell * 0.26;
  const defaultBetweenLineThickness = sourceUnitsPerCell * 0.10;

  // background image / underlay aliases
  cosmetics.backgroundImageUrl =
    (typeof scl?.underlay?.image === "string" ? scl.underlay.image : undefined) ??
    (typeof scl?.backgroundImage === "string" ? scl.backgroundImage : undefined) ??
    (typeof scl?.background?.image === "string" ? scl.background.image : undefined);

  // Cell background colors from fpuz/scl grid cell objects.
  const cellBackgrounds: NonNullable<PuzzleCosmetics["underlays"]> = [];
  const colorGrids = [scl?.cells, scl?.grid].filter(Array.isArray);
  for (const grid of colorGrids) {
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell || typeof cell !== "object") continue;
        const palette = [
          ...(Array.isArray(cell?.cArray) ? cell.cArray : []),
          cell?.c,
          cell?.color,
          cell?.backgroundColor,
          cell?.bgColor,
          cell?.fill,
        ]
          .map(normalizeColorToken)
          .filter((v): v is string => Boolean(v));
        if (!palette.length) continue;
        const color = palette[0] as string;
        if (color === "#000000" || color === "#0" || color.toLowerCase() === "transparent") continue;
        cellBackgrounds.push({
          center: { x: c + 0.5, y: r + 0.5 },
          width: 1,
          height: 1,
          rounded: false,
          color,
          opacity: parseOpacityToken(cell?.alpha ?? cell?.opacity) ?? 1,
        });
      }
    }
  }
  if (cellBackgrounds.length) cosmetics.underlays = [...(cosmetics.underlays ?? []), ...cellBackgrounds];

  // cages
  const cagesSrc = Array.isArray(scl?.cages)
    ? scl.cages
    : Array.isArray(scl?.cage)
      ? scl.cage
    : Array.isArray(scl?.killerCages)
      ? scl.killerCages
      : Array.isArray(scl?.killercage)
        ? scl.killercage
      : Array.isArray(scl?.killer)
        ? scl.killer
        : [];
  if (cagesSrc.length) {
    cosmetics.cages = cagesSrc
      .map((cg: any) => {
        if (cg?.hidden === true) return null;
        const cells = parseCellRefs(cg?.cells ?? cg?.ce);
        if (!cells.length) return null;
        const rawDash = cg?.["stroke-dasharray"] ?? cg?.dashArray ?? cg?.dash;
        const dashArray = Array.isArray(rawDash)
          ? rawDash.map((n: unknown) => Number(n)).filter(Number.isFinite)
          : typeof rawDash === "string"
            ? rawDash.split(/[ ,]+/).map((n: string) => Number(n.trim())).filter(Number.isFinite)
            : undefined;
        return {
          cells,
          sum: asValue(cg?.value ?? cg?.sum ?? cg?.v),
          color: normalizeColorToken(cg?.outlineC ?? cg?.borderColor ?? cg?.stroke ?? cg?.color),
          textColor: normalizeColorToken(cg?.fontC ?? cg?.fontColor ?? cg?.textColor ?? cg?.labelColor ?? cg?.color),
          fillColor: normalizeColorToken(cg?.backgroundColor ?? cg?.fill ?? cg?.c2),
          thickness: parseFiniteNumberToken(cg?.thickness ?? cg?.borderThickness ?? cg?.th),
          dashArray: dashArray?.length ? dashArray : undefined,
          opacity: parseOpacityToken(cg?.opacity ?? cg?.alpha),
        };
      })
      .filter(Boolean) as any;
  }

  // arrows
  const arrowsSrc = Array.isArray(scl?.arrow)
    ? scl.arrow
    : Array.isArray(scl?.arrows)
      ? scl.arrows
      : Array.isArray(scl?.a)
        ? scl.a
        : [];
  if (arrowsSrc.length) {
    cosmetics.arrows = arrowsSrc
      .map((a: any) => {
        const lineCells = Array.isArray(a?.lines) && Array.isArray(a.lines[0]) ? a.lines[0] : undefined;
        const bulbCells = parseCellRefs(a?.cells ?? a?.ce);
        const shaftCells = parseCellRefs(lineCells);
        const cellPath = shaftCells.length ? shaftCells : bulbCells;
        const wpPath = (a?.wayPoints ?? a?.wp ?? a?.points ?? [])
          .map(asPoint)
          .filter(Boolean) as Array<{ x: number; y: number }>;
        if (cellPath.length < 2 && wpPath.length < 2) return null;
        const bulb = bulbCells[0];
        return {
          bulb,
          path: cellPath.length ? cellPath : undefined,
          wayPoints: wpPath.length ? wpPath : undefined,
          headLength: parseFiniteNumberToken(a?.headLength ?? a?.hl),
          color: normalizeColorToken(a?.color ?? a?.lineColor ?? a?.c),
          thickness: parseFiniteNumberToken(a?.thickness ?? a?.th),
          bulbFill: normalizeColorToken(a?.bulbColor ?? a?.baseC ?? "#ffffff"),
          bulbStroke: normalizeColorToken(a?.bulbBorderColor ?? a?.outlineC ?? a?.color ?? a?.lineColor ?? a?.c ?? "#222222"),
          bulbStrokeThickness: parseFiniteNumberToken(a?.bulbBorderThickness),
        };
      })
      .filter(Boolean) as any;
  }

  // dots
  const dotsSrc = Array.isArray(scl?.dots)
    ? scl.dots
    : Array.isArray(scl?.kropki)
      ? scl.kropki
      : Array.isArray(scl?.dot)
        ? scl.dot
        : [];
  if (dotsSrc.length) {
    cosmetics.dots = dotsSrc
      .map((d: any) => {
        const cells = parseCellRefs(d?.cells ?? d?.ce ?? [d?.a, d?.b]);
        if (cells.length !== 2) return null;
        const kind = d?.type === "white" || d?.color === "white" ? "white" : "black";
        return { a: cells[0], b: cells[1], kind };
      })
      .filter(Boolean) as any;
  }

  // Native SudokuPad lines are often in `lines` with floating-point wayPoints.
  const linesSrc = Array.isArray(scl?.lines)
    ? scl.lines
    : Array.isArray(scl?.line)
      ? scl.line
      : Array.isArray(scl?.l)
        ? scl.l
        : [];
  if (linesSrc.length) {
    cosmetics.lines = linesSrc
      .map((ln: any) => {
        const wayPointsRaw = (ln?.wayPoints ?? ln?.points ?? ln?.wp ?? [])
          .map(asPoint)
          .filter(Boolean) as Array<{ x: number; y: number }>;
        const lineCellRefs = Array.isArray(ln?.lines)
          ? parseCellRefs(Array.isArray(ln.lines[0]) ? ln.lines[0] : ln.lines)
          : parseCellRefs(ln?.cells ?? ln?.ce);
        const lineRefPoints = lineCellRefs.map((rc) => ({ x: rc.c + 0.5, y: rc.r + 0.5 }));
        const svgPathData = typeof ln?.d2 === "string" ? ln.d2 : typeof ln?.d === "string" ? ln.d : undefined;
        const svgPathPoints = typeof svgPathData === "string"
          ? parseSvgPathToWayPoints(svgPathData, Number(scl?.cellSize) || 64)
          : [];
        const wayPoints = wayPointsRaw.length >= 2
          ? wayPointsRaw
          : lineRefPoints.length >= 2
            ? lineRefPoints
            : svgPathPoints;
        if (wayPoints.length < 2) return null;
        const strokeToken = normalizeColorToken(ln?.color ?? ln?.lineColor ?? ln?.stroke ?? ln?.outlineC ?? ln?.c);
        const fillToken = normalizeColorToken(ln?.fill ?? ln?.backgroundColor ?? ln?.c2);
        const closedByShape = wayPoints.length > 2 && pointsAlmostEqual(wayPoints[0] as { x: number; y: number }, wayPoints[wayPoints.length - 1] as { x: number; y: number });
        const rawDash = ln?.["stroke-dasharray"] ?? ln?.dashArray ?? ln?.dash;
        const dashArray = Array.isArray(rawDash)
          ? rawDash.map((n: unknown) => Number(n)).filter(Number.isFinite)
          : typeof rawDash === "string"
            ? rawDash.split(/[ ,]+/).map((n: string) => Number(n.trim())).filter(Number.isFinite)
            : undefined;
        const lineCapRaw = String(ln?.["stroke-linecap"] ?? ln?.lineCap ?? "").toLowerCase();
        const lineJoinRaw = String(ln?.["stroke-linejoin"] ?? ln?.lineJoin ?? "").toLowerCase();
        const lineCap = lineCapRaw === "round" || lineCapRaw === "square" || lineCapRaw === "butt" ? lineCapRaw : undefined;
        const lineJoin = lineJoinRaw === "round" || lineJoinRaw === "bevel" || lineJoinRaw === "miter" ? lineJoinRaw : undefined;
        const thicknessToken = parseFiniteNumberToken(ln?.thickness ?? ln?.th);
        const widthUnits = parseFiniteNumberToken(ln?.width);
        const sourceUnitsPerCell = Number(scl?.cellSize) || 64;
        return {
          wayPoints,
          color: strokeToken === "#0" ? undefined : strokeToken,
          fillColor: fillToken === "#0" ? undefined : fillToken,
          closePath: Boolean(ln?.closed ?? ln?.closePath ?? ln?.fill) || closedByShape,
          svgPathData,
          svgUnitsPerCell: sourceUnitsPerCell,
          thickness: thicknessToken ?? (widthUnits != null ? widthUnits * sourceUnitsPerCell : undefined),
          target: typeof ln?.target === "string" ? ln.target : undefined,
          lineCap,
          lineJoin,
          dashArray: dashArray?.length ? dashArray : undefined,
          opacity: parseOpacityToken(ln?.opacity ?? ln?.alpha),
        };
      })
      .filter(Boolean) as any;
  }

  // Thermometer variants: modern `thermos` and legacy `thermometer` with nested `lines`.
  const thermometerLines = [
    ...(Array.isArray(scl?.thermos) ? scl.thermos : []),
    ...(Array.isArray(scl?.thermometer)
      ? scl.thermometer.flatMap((t: any) => (Array.isArray(t?.lines) ? t.lines.map((line: any) => ({ cells: line })) : [t]))
      : []),
  ];
  if (thermometerLines.length) {
    const defaultThermoColor = "#cfcfcf";
    const thermoAsLines = thermometerLines
      .map((item: any) => {
        const path = parseCellRefs(item?.cells ?? item?.ce ?? item?.line ?? item);
        if (path.length < 2) return null;
        const lineColor = normalizeColorToken(item?.color ?? item?.lineColor ?? item?.c ?? item?.c1) ?? defaultThermoColor;
        const rawDash = item?.["stroke-dasharray"] ?? item?.dashArray ?? item?.dash;
        const dashArray = Array.isArray(rawDash)
          ? rawDash.map((n: unknown) => Number(n)).filter(Number.isFinite)
          : typeof rawDash === "string"
            ? rawDash.split(/[ ,]+/).map((n: string) => Number(n.trim())).filter(Number.isFinite)
            : undefined;
        const lineCapRaw = String(item?.["stroke-linecap"] ?? item?.lineCap ?? "").toLowerCase();
        const lineJoinRaw = String(item?.["stroke-linejoin"] ?? item?.lineJoin ?? "").toLowerCase();
        const lineCap = lineCapRaw === "round" || lineCapRaw === "square" || lineCapRaw === "butt" ? lineCapRaw : undefined;
        const lineJoin = lineJoinRaw === "round" || lineJoinRaw === "bevel" || lineJoinRaw === "miter" ? lineJoinRaw : undefined;
        return {
          wayPoints: path.map((rc) => ({ x: rc.c + 0.5, y: rc.r + 0.5 })),
          color: lineColor,
          thickness: parseFiniteNumberToken(item?.thickness ?? item?.th) ?? defaultThermoThickness,
          target: typeof item?.target === "string" ? item.target : "underlay",
          lineCap,
          lineJoin,
          dashArray: dashArray?.length ? dashArray : undefined,
          opacity: parseOpacityToken(item?.opacity ?? item?.alpha),
        };
      })
      .filter(Boolean) as NonNullable<PuzzleCosmetics["lines"]>;
    cosmetics.lines = [...(cosmetics.lines ?? []), ...thermoAsLines];

    const thermoBulbs = thermometerLines
      .map((item: any) => {
        const path = parseCellRefs(item?.cells ?? item?.ce ?? item?.line ?? item);
        if (!path.length) return null;
        const first = path[0] as CellRC;
        const lineColor = normalizeColorToken(item?.color ?? item?.lineColor ?? item?.c ?? item?.c1) ?? defaultThermoColor;
        return {
          center: { x: first.c + 0.5, y: first.r + 0.5 },
          width: 0.72,
          height: 0.72,
          rounded: true,
          color: normalizeColorToken(item?.bulbColor ?? item?.baseC) ?? lineColor,
          borderColor: normalizeColorToken(item?.borderColor ?? item?.outlineC),
          borderThickness: parseFiniteNumberToken(item?.borderThickness ?? item?.thickness ?? item?.th),
        };
      })
      .filter(Boolean) as NonNullable<PuzzleCosmetics["underlays"]>;
    if (thermoBulbs.length) cosmetics.underlays = [...(cosmetics.underlays ?? []), ...thermoBulbs];
  }

  const parseLayerItem = (item: any) => {
    const ct = asPoint(item?.center ?? item?.ct);
    if (!ct) return null;
    const rawWidth = item?.width ?? item?.w;
    const rawHeight = item?.height ?? item?.h;
    const width = parseFiniteNumberToken(rawWidth);
    const height = parseFiniteNumberToken(rawHeight);
    const rounded = Boolean(item?.rounded ?? item?.r);
    const text = item?.text ?? item?.te;
    const textStr = text == null ? "" : String(text).trim();
    const explicitTextSize = parseFiniteNumberToken(item?.textSize ?? item?.fontSize ?? item?.fs);
    const minSpan = Math.min(
      Number.isFinite(width) ? Number(width) : Number.POSITIVE_INFINITY,
      Number.isFinite(height) ? Number(height) : Number.POSITIVE_INFINITY,
    );
    const inferredTinyTextSize =
      explicitTextSize == null && text != null && Number.isFinite(minSpan) && minSpan <= 0.35
        ? Math.max(9, Math.min(14, minSpan * 56 * 2.0))
        : undefined;
    const isTinyTextMarker =
      textStr.length === 1 &&
      typeof width === "number" &&
      typeof height === "number" &&
      width <= 0.42 &&
      height <= 0.42;

    const hasExplicitBorderColor = item?.borderColor != null || item?.outlineC != null || item?.c1 != null;
    const hasExplicitFillColor = item?.backgroundColor != null || item?.fill != null || item?.baseC != null;
    // Keep explicit border channels (`borderColor`/`outlineC`/`c1`) authoritative.
    // Compact exports commonly use `c1: #0` to mean a black outline.
    const rawExplicitBorder = item?.borderColor ?? item?.outlineC ?? item?.c1;
    const explicitBorderToken = normalizeColorToken(rawExplicitBorder);
    const rawStroke = item?.stroke;
    const strokeToken = normalizeColorToken(rawStroke);
    const isTinyRoundedTextMarker =
      textStr.length > 0 &&
      rounded &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      Number(width) <= 0.5 &&
      Number(height) <= 0.5;
    const hasZeroSpan =
      (Number.isFinite(width) && Number(width) <= 0.001) ||
      (Number.isFinite(height) && Number(height) <= 0.001);
    const strokeActsAsTextColor = isTinyRoundedTextMarker && !hasExplicitBorderColor && item?.stroke != null;
    const borderColor = strokeActsAsTextColor
      ? undefined
      : explicitBorderToken ?? (isNoStrokeToken(rawStroke) ? undefined : strokeToken);
    const fillColor = normalizeColorToken(item?.backgroundColor ?? item?.c2 ?? item?.fill);
    const isSlenderTextAnchor =
      textStr.length > 0 &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      Number(Math.min(width as number, height as number)) <= 0.2 &&
      Number(Math.max(width as number, height as number)) >= 0.45;
    const shouldTreatAsTextOnly =
      hasZeroSpan ||
      isSlenderTextAnchor &&
      !hasExplicitFillColor;
    const noVisibleStroke = !borderColor;
    const isRoundedTextMarker = textStr.length > 0 && rounded && noVisibleStroke;
    const tinyMarkerShouldKeepShape = isTinyTextMarker && rounded && (Boolean(fillColor) || Boolean(borderColor));
    const suppressShape =
      shouldTreatAsTextOnly ||
      (!tinyMarkerShouldKeepShape && isTinyTextMarker) ||
      (isRoundedTextMarker && !fillColor);

    return {
      center: ct,
      width,
      height,
      rounded: suppressShape ? false : rounded,
      color: suppressShape ? undefined : fillColor,
      borderColor: suppressShape ? undefined : borderColor,
      borderThickness: parseFiniteNumberToken(item?.thickness ?? item?.th),
      text,
      textColor: normalizeColorToken(
        item?.color ??
        item?.textColor ??
        item?.c ??
        (strokeActsAsTextColor || shouldTreatAsTextOnly ? item?.stroke : undefined)
      ),
      textSize: explicitTextSize ?? inferredTinyTextSize,
      angle: parseFiniteNumberToken(item?.angle),
      target: typeof item?.target === "string" ? item.target : undefined,
      opacity: parseOpacityToken(item?.opacity ?? item?.alpha),
    };
  };

  const overlaysSrc = Array.isArray(scl?.overlays) ? scl.overlays : [];
  if (overlaysSrc.length) {
    const parsed = overlaysSrc.map(parseLayerItem).filter(Boolean) as Array<Record<string, unknown>>;
    const under = parsed.filter((item) => {
      const target = categorizeTarget(item.target);
      if (target === "under") return true;
      return false;
    });
    const over = parsed.filter((item) => !under.includes(item));
    if (over.length) cosmetics.overlays = over as any;
    if (under.length) cosmetics.underlays = [...(cosmetics.underlays ?? []), ...(under as any)];
  }

  const underlaysSrc = Array.isArray(scl?.underlays) ? scl.underlays : [];
  if (underlaysSrc.length) {
    const parsed = underlaysSrc.map(parseLayerItem).filter(Boolean) as Array<Record<string, unknown>>;
    const over = parsed.filter((item) => categorizeTarget(item.target) === "over");
    const under = parsed.filter((item) => !over.includes(item));
    if (under.length) cosmetics.underlays = [...(cosmetics.underlays ?? []), ...(under as any)];
    if (over.length) cosmetics.overlays = [...(cosmetics.overlays ?? []), ...(over as any)];
  }

  // Legacy geometric clue primitives used by some older SudokuPad puzzles.
  const circleSrc = Array.isArray(scl?.circle) ? scl.circle : [];
  const rectangleSrc = Array.isArray(scl?.rectangle) ? scl.rectangle : [];
  const shapeOverlays = [...circleSrc, ...rectangleSrc]
    .map((item: any) => {
      const cells = parseCellRefs(item?.cells ?? item?.ce);
      const center = asPoint(item?.center ?? item?.ct) ?? centerFromCells(cells);
      if (!center) return null;
      const span = spanFromCells(cells);
      const rawLegacyStroke = item?.borderColor ?? item?.outlineC ?? item?.c1 ?? item?.c;
      return {
        center,
        width: typeof item?.width === "number" ? item.width : span?.width,
        height: typeof item?.height === "number" ? item.height : span?.height,
        rounded: item?.rounded ?? item?.r ?? circleSrc.includes(item),
        color: normalizeColorToken(item?.backgroundColor ?? item?.baseC ?? item?.c2),
        borderColor: isNoStrokeToken(rawLegacyStroke) ? undefined : normalizeColorToken(rawLegacyStroke),
        borderThickness: typeof item?.thickness === "number" ? item.thickness : undefined,
        text: asValue(item?.value),
        textColor: normalizeColorToken(item?.textColor ?? item?.fontC ?? item?.color),
        textSize: typeof item?.size === "number" ? Math.max(8, item.size * 28) : undefined,
        angle: typeof item?.angle === "number" ? item.angle : undefined,
      };
    })
    .filter(Boolean) as NonNullable<PuzzleCosmetics["overlays"]>;
  if (shapeOverlays.length) cosmetics.overlays = [...(cosmetics.overlays ?? []), ...shapeOverlays];

  // Difference / ratio clues can be represented as dots between two cells.
  const diffDots = Array.isArray(scl?.difference)
    ? scl.difference
        .map((d: any) => {
          const cells = parseCellRefs(d?.cells ?? d?.ce);
          if (cells.length !== 2) return null;
          return { a: cells[0] as CellRC, b: cells[1] as CellRC, kind: "black" as const };
        })
        .filter(Boolean)
    : [];
  const ratioDots = Array.isArray(scl?.ratio)
    ? scl.ratio
        .map((d: any) => {
          const cells = parseCellRefs(d?.cells ?? d?.ce);
          if (cells.length !== 2) return null;
          return { a: cells[0] as CellRC, b: cells[1] as CellRC, kind: "white" as const };
        })
        .filter(Boolean)
    : [];
  if (diffDots.length || ratioDots.length) {
    cosmetics.dots = [...(cosmetics.dots ?? []), ...(diffDots as any), ...(ratioDots as any)];
  }

  // Generic text clues (often directional markers) rendered as overlays.
  if (Array.isArray(scl?.text)) {
    const textItems = scl.text
      .map((t: any) => {
        const cells = parseCellRefs(t?.cells ?? t?.ce);
        const center = asPoint(t?.center ?? t?.ct) ?? centerFromCells(cells);
        if (!center) return null;
        const sizeScale = typeof t?.size === "number" ? t.size : 0.58;
        return {
          center,
          width: typeof t?.width === "number" ? t.width : undefined,
          height: typeof t?.height === "number" ? t.height : undefined,
          rounded: false,
          color: undefined,
          borderColor: undefined,
          text: asValue(t?.value ?? t?.text),
          textColor: normalizeColorToken(t?.fontC ?? t?.color ?? t?.textColor),
          textSize: Math.max(9, 28 * sizeScale),
          angle: typeof t?.angle === "number" ? t.angle : undefined,
        };
      })
      .filter(Boolean) as NonNullable<PuzzleCosmetics["overlays"]>;
    if (textItems.length) cosmetics.overlays = [...(cosmetics.overlays ?? []), ...textItems];
  }

  // line constraints
  const extractPathConstraint = (arr: any[], color?: string): Array<{ path: CellRC[]; color?: string }> => 
    arr
      ?.map((item: any) => {
        const path = parseCellRefs(item?.cells ?? item?.ce);
        if (path.length < 2) return null;
        return { path, color: item?.color ?? color };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null) ?? [];

  // Between lines are represented like thermos but with line-only semantics.
  if (Array.isArray(scl?.betweenline)) {
    const betweenEntries = scl.betweenline
      .flatMap((item: any) => (Array.isArray(item?.lines) ? item.lines.map((line: any) => ({ ...item, cells: line })) : [item]));

    const defaultBetweenLineColor = "#cfcfcf";
    const betweenAsLines = betweenEntries
      .map((item: any) => {
        const path = parseCellRefs(item?.cells ?? item?.ce ?? item?.line ?? item?.lines ?? item);
        if (path.length < 2) return null;
        const lineColor = normalizeColorToken(item?.color ?? item?.lineColor ?? item?.c ?? item?.c1) ?? defaultBetweenLineColor;
        const rawDash = item?.["stroke-dasharray"] ?? item?.dashArray ?? item?.dash;
        const dashArray = Array.isArray(rawDash)
          ? rawDash.map((n: unknown) => Number(n)).filter(Number.isFinite)
          : typeof rawDash === "string"
            ? rawDash.split(/[ ,]+/).map((n: string) => Number(n.trim())).filter(Number.isFinite)
            : undefined;
        const lineCapRaw = String(item?.["stroke-linecap"] ?? item?.lineCap ?? "").toLowerCase();
        const lineJoinRaw = String(item?.["stroke-linejoin"] ?? item?.lineJoin ?? "").toLowerCase();
        const lineCap = lineCapRaw === "round" || lineCapRaw === "square" || lineCapRaw === "butt" ? lineCapRaw : undefined;
        const lineJoin = lineJoinRaw === "round" || lineJoinRaw === "bevel" || lineJoinRaw === "miter" ? lineJoinRaw : undefined;
        return {
          wayPoints: path.map((rc) => ({ x: rc.c + 0.5, y: rc.r + 0.5 })),
          color: lineColor,
          thickness: parseFiniteNumberToken(item?.thickness ?? item?.th) ?? defaultBetweenLineThickness,
          target: typeof item?.target === "string" ? item.target : "underlay",
          lineCap,
          lineJoin,
          dashArray: dashArray?.length ? dashArray : undefined,
          opacity: parseOpacityToken(item?.opacity ?? item?.alpha),
        };
      })
      .filter(Boolean) as NonNullable<PuzzleCosmetics["lines"]>;
    if (betweenAsLines.length) cosmetics.lines = [...(cosmetics.lines ?? []), ...betweenAsLines];

    const betweenEndpointCircles = betweenEntries
      .flatMap((item: any) => {
        const path = parseCellRefs(item?.cells ?? item?.ce ?? item?.line ?? item?.lines ?? item);
        if (path.length < 2) return [];
        const start = path[0] as CellRC;
        const end = path[path.length - 1] as CellRC;
        return [start, end].map((rc) => ({
          center: { x: rc.c + 0.5, y: rc.r + 0.5 },
          width: 0.62,
          height: 0.62,
          rounded: true,
          color: normalizeColorToken(item?.endFillColor ?? item?.baseC) ?? "#ffffff",
          borderColor: normalizeColorToken(item?.endBorderColor ?? item?.outlineC) ?? "#9f9f9f",
          borderThickness: parseFiniteNumberToken(item?.endBorderThickness ?? item?.borderThickness ?? item?.thickness ?? item?.th) ?? 1.8,
        }));
      }) as NonNullable<PuzzleCosmetics["underlays"]>;
    if (betweenEndpointCircles.length) cosmetics.underlays = [...(cosmetics.underlays ?? []), ...betweenEndpointCircles];
  }

  if (Array.isArray(scl?.thermos)) cosmetics.thermolines = extractPathConstraint(scl.thermos, "#ff6b6b") as any;
  if (Array.isArray(scl?.whispers)) cosmetics.whispers = extractPathConstraint(scl.whispers, "#00c2a8") as any;
  if (Array.isArray(scl?.palindromes)) cosmetics.palindromes = extractPathConstraint(scl.palindromes, "#ffa500") as any;
  if (!cosmetics.palindromes && Array.isArray(scl?.palindrome)) cosmetics.palindromes = extractPathConstraint(scl.palindrome, "#ffa500") as any;
  if (Array.isArray(scl?.renban)) cosmetics.renbanlines = extractPathConstraint(scl.renban, "#7c3aed") as any;
  if (Array.isArray(scl?.entropic)) cosmetics.entropics = extractPathConstraint(scl.entropic, "#f72585") as any;
  if (Array.isArray(scl?.germanwhispers)) cosmetics.germanwhispers = extractPathConstraint(scl.germanwhispers, "#00d4ff") as any;
  if (Array.isArray(scl?.modular)) cosmetics.modularlines = extractPathConstraint(scl.modular, "#ffb703") as any;

  // Odd/even markers (legacy fpuz fields).
  const oddSrc = Array.isArray(scl?.odd) ? scl.odd : [];
  const evenSrc = Array.isArray(scl?.even) ? scl.even : [];
  const parityOverlays = [...oddSrc.map((v: any) => ({ ...v, __kind: "odd" })), ...evenSrc.map((v: any) => ({ ...v, __kind: "even" }))]
    .map((item: any) => {
      const rc =
        asRC(item?.cell ?? item?.rc ?? item?.ce) ??
        parseCellRefs(item?.cell ?? item?.rc ?? item?.ce)[0] ??
        null;
      const center = rc ? { x: rc.c + 0.5, y: rc.r + 0.5 } : asPoint(item?.center ?? item?.ct);
      if (!center) return null;
      const isOdd = item.__kind === "odd";
      return {
        center,
        width: 0.56,
        height: 0.56,
        rounded: isOdd,
        color: isOdd ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.6)",
        borderColor: isOdd ? "#000000" : "#222222",
        borderThickness: 1.1,
      };
    })
    .filter(Boolean) as NonNullable<PuzzleCosmetics["underlays"]>;
  if (parityOverlays.length) cosmetics.underlays = [...(cosmetics.underlays ?? []), ...parityOverlays];

  // Clues around grid
  if (scl?.clues) {
    const clues = scl.clues;
    if (clues.skyscraper) cosmetics.skyscraper = clues.skyscraper;
    if (clues.sandwich) cosmetics.sandwich = clues.sandwich;
    if (clues.xsum) cosmetics.xsum = clues.xsum;
  }

  // Little killer clues
  if (Array.isArray(scl?.littlekillers)) {
    cosmetics.littlekillers = scl.littlekillers
      .map((lk: any) => {
        const rc = asRC(lk?.cell ?? lk?.rc ?? lk?.ce);
        if (!rc) return null;
        return {
          rc,
          direction: lk?.direction ?? "tl",
          value: String(lk?.value ?? ""),
          color: lk?.color,
        };
      })
      .filter(Boolean) as any;
  }

  // Irregular regions (jigsaw)
  if (Array.isArray(scl?.irregularRegions) || Array.isArray(scl?.jigsaw)) {
    const regions = scl?.irregularRegions ?? scl?.jigsaw;
    cosmetics.irregularRegions = regions
      .map((region: any) => {
        const cells = parseCellRefs(region?.cells ?? region?.ce);
        if (!cells.length) return null;
        return { cells, color: region?.color };
      })
      .filter(Boolean) as any;
  }

  // Standard regions can also be represented in `regions` as arrays of cell refs.
  if (!cosmetics.irregularRegions && Array.isArray(scl?.regions)) {
    cosmetics.irregularRegions = scl.regions
      .map((region: any) => {
        const cells = parseCellRefs(region);
        if (!cells.length) return null;
        return { cells };
      })
      .filter(Boolean) as any;
  }

  // Disjoint groups
  if (Array.isArray(scl?.disjointGroups)) {
    cosmetics.disjointGroups = scl.disjointGroups
      .map((group: any) => {
        const cells = parseCellRefs(group?.cells ?? group?.ce);
        if (!cells.length) return null;
        return { cells, color: group?.color };
      })
      .filter(Boolean) as any;
  }

  // Anti-constraints
  if (scl?.antiKnight || scl?.antiknight) cosmetics.antiKnight = true;
  if (scl?.antiKing || scl?.antiking) cosmetics.antiKing = true;
  if (scl?.antiRook || scl?.antirook) cosmetics.antiRook = true;

  // Fog of war: common SCL keys include foglight/fogLight/fogLights.
  const rawFogLights = scl?.foglight ?? scl?.fogLight ?? scl?.fogLights ?? scl?.fog?.lights ?? scl?.fog?.light;
  if (Array.isArray(rawFogLights)) {
    cosmetics.fogLights = rawFogLights.map(asRC).filter(Boolean) as CellRC[];
  } else if (Array.isArray(scl?.cells)) {
    const fromCells: CellRC[] = [];
    for (let r = 0; r < scl.cells.length; r++) {
      const row = scl.cells[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell?.fogLight || cell?.foglight || cell?.light) fromCells.push({ r, c });
      }
    }
    if (fromCells.length) cosmetics.fogLights = fromCells;
  }

  // Trigger-driven fog reveals (common in modern fog puzzles).
  if (Array.isArray(scl?.triggereffect)) {
    cosmetics.fogTriggerEffects = scl.triggereffect
      .map((te: any) => {
        if (te?.effect?.type !== "foglight") return null;
        const triggerCells = [
          ...parseRcString(te?.trigger?.cell),
          ...parseRcString(te?.trigger?.ce),
          ...parseCellRefs(te?.trigger?.cells),
        ];
        const revealCells = [
          ...parseRcString(te?.effect?.cells),
          ...parseRcString(te?.effect?.ce),
          ...parseCellRefs(te?.effect?.cells),
        ];
        if (!triggerCells.length || !revealCells.length) return null;
        const triggerMode = typeof te?.trigger?.operator === "string" ? te.trigger.operator : undefined;
        return { triggerCells, revealCells, triggerMode };
      })
      .filter(Boolean) as any;
  }

  // Keep solution if present so fog can reveal based on correct entries.
  const solution = scl?.metadata?.solution;
  if (typeof solution === "string") cosmetics.solution = solution;

  const noGridFromData =
    parseBoolish(scl?.settings?.nogrid) ||
    parseBoolish(scl?.settings?.noGrid) ||
    parseBoolish(scl?.metadata?.settings?.nogrid) ||
    parseBoolish(scl?.metadata?.settings?.noGrid) ||
    parseBoolish(scl?.metadata?.nogrid) ||
    parseBoolish(scl?.metadata?.noGrid);
  if (noGridFromData) cosmetics.gridVisible = false;

  return cosmetics;
}