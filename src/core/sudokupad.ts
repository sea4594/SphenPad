/* eslint-disable @typescript-eslint/no-explicit-any */

import { z } from "zod";
import { decompressFromBase64 } from "lz-string";
import { normalizePuzzleKey } from "./id";
import type { PuzzleDefinition, CellRC, PuzzleCosmetics } from "./model";

/**
 * SudokuPad has a public API endpoint used by their own tooling:
 * https://sudokupad.app/api/puzzle/<puzzleId> :contentReference[oaicite:1]{index=1}
 */
const DEV_API_BASE = "/sp-api/api/puzzle";
const PROD_PROXY_A = "https://api.codetabs.com/v1/proxy/?quest=https://sudokupad.app/api/puzzle";
const PROD_API_BASE = "https://api.allorigins.win/raw?url=https://sudokupad.app/api/puzzle";

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
      if (looksLikePuzzlePayload(text)) return text;
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
      /(stroke|color|lineColor|fill|fillColor|textColor|fontColor|c1|c2|c|backgroundColor|borderColor)\s*:\s*([A-Za-z0-9#]{3,12})(?=[,}\]])/g,
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

function normalizeCompactScl(input: any): any {
  if (!input || typeof input !== "object") return input;
  const scl = { ...input } as any;

  // Compact aliases used in older SudokuPad exports.
  if (!scl.cells && Array.isArray(scl.ce)) scl.cells = scl.ce;
  if (!scl.regions && Array.isArray(scl.re)) scl.regions = scl.re;
  if (!scl.lines && Array.isArray(scl.l)) scl.lines = scl.l;
  if (!scl.overlays && Array.isArray(scl.o)) scl.overlays = scl.o;
  if (!scl.underlays && Array.isArray(scl.u)) scl.underlays = scl.u;
  if (!scl.arrow && Array.isArray(scl.a)) scl.arrow = scl.a;
  if (!scl.dots && Array.isArray(scl.d)) scl.dots = scl.d;
  if (!scl.cages && Array.isArray(scl.ca)) scl.cages = scl.ca;
  if (!scl.metadata && scl.md && typeof scl.md === "object") scl.metadata = scl.md;

  if (!scl.metadata) scl.metadata = {};

  // Some compact payloads keep title/author/rules as an array of "key: value" strings in `ca`.
  if (Array.isArray(input?.ca)) {
    for (const item of input.ca) {
      const v = typeof item?.v === "string" ? item.v : "";
      const m = v.match(/^\s*(title|author|rules?)\s*:\s*(.+)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      if ((key === "rule" || key === "rules") && !scl.metadata.rules) scl.metadata.rules = value;
      if (key === "title" && !scl.metadata.title) scl.metadata.title = value;
      if (key === "author" && !scl.metadata.author) scl.metadata.author = value;
    }
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
  return s || undefined;
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
  if (Array.isArray(value)) return value.map(asRC).filter(Boolean) as CellRC[];
  if (typeof value === "string") return parseRcString(value);
  return [];
}

function centerFromCells(cells: CellRC[]): { x: number; y: number } | null {
  if (!cells.length) return null;
  const sx = cells.reduce((acc, rc) => acc + (rc.c + 0.5), 0);
  const sy = cells.reduce((acc, rc) => acc + (rc.r + 0.5), 0);
  return { x: sx / cells.length, y: sy / cells.length };
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
  const inferred = Math.max(fromCells, fromGivenCoords, fromRegionCoords, fromSolutionSquare, explicitSize);
  return inferred > 0 ? inferred : 9;
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

export async function loadFromSudokuPad(inputUrlOrId: string): Promise<{ key: string; def: PuzzleDefinition; raw: any }> {
  const sourceIdRaw = parseSourceId(inputUrlOrId);
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

  const meta = {
    title:
      sclObj?.metadata?.title ??
      sclObj?.metadata?.name ??
      sclObj?.metadata?.t ??
      sclObj?.metadata?.puzzleTitle ??
      sclObj?.title ??
      sclObj?.name ??
      "",
    author: sclObj?.metadata?.author ?? sclObj?.metadata?.by ?? sclObj?.metadata?.creator ?? "",
    rules:
      sclObj?.metadata?.rules ??
      sclObj?.metadata?.rule ??
      sclObj?.metadata?.description ??
      "",
    postSolveMessage:
      sclObj?.metadata?.postSolveMessage ??
      sclObj?.metadata?.postsolve ??
      sclObj?.metadata?.successMessage ??
      sclObj?.metadata?.congrats ??
      sclObj?.metadata?.msgcorrect ??
      sclObj?.metadata?.messageAfterSolve ??
      "",
    solveCount: parseSolveCount(
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
    ),
  };

  const givens = extractGivens(sclObj);
  const cosmetics = extractCosmetics(sclObj);
  const size = inferPuzzleSize(sclObj, givens);

  const key = normalizePuzzleKey(sourceId);
  const def: PuzzleDefinition = {
    id: key,
    sourceId,
    size,
    meta,
    givens,
    cosmetics,
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
      let b64 = m[2];
      try {
        b64 = decodeURIComponent(b64);
      } catch {
        // no-op
      }
      const decompressed = decompressFromBase64(b64);
      const j = tryParseJson(decompressed);
      if (j) return j;
      const jLoose = tryParseLooseObjectLiteral(decompressed);
      if (jLoose) return normalizeCompactScl(jLoose);
      const j2 = tryParseJson(decompressedFromMaybeZipped(decompressed));
      if (j2) return j2;
    }

    // If it's plain JSON text
    const j = tryParseJson(s);
    if (j) return j;

    const jLoose = tryParseLooseObjectLiteral(s);
    if (jLoose) return normalizeCompactScl(jLoose);

    // Otherwise: best-effort — maybe already decompressed but still JSON-ish
    const j3 = tryParseJson(decompressedFromMaybeZipped(s));
    if (j3) return j3;
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
  const cells = scl?.cells;
  if (!Array.isArray(cells)) return out;

  for (let r = 0; r < cells.length; r++) {
    const row = cells[r];
    if (!Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      const value = asValue(cell?.value ?? cell?.v ?? cell?.given ?? cell?.g);
      if (value != null) out.push({ rc: { r, c }, v: value });
    }
  }
  return out;
}

function extractCosmetics(scl: any): PuzzleCosmetics {
  const cosmetics: PuzzleCosmetics = {};

  // background image / underlay aliases
  cosmetics.backgroundImageUrl =
    (typeof scl?.underlay?.image === "string" ? scl.underlay.image : undefined) ??
    (typeof scl?.backgroundImage === "string" ? scl.backgroundImage : undefined) ??
    (typeof scl?.background?.image === "string" ? scl.background.image : undefined);

  // cages
  const cagesSrc = Array.isArray(scl?.cages)
    ? scl.cages
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
        const cells = parseCellRefs(cg?.cells ?? cg?.ce);
        if (!cells.length) return null;
        return {
          cells,
          sum: asValue(cg?.value ?? cg?.sum),
          color: cg?.outlineC ?? cg?.color ?? undefined,
        };
      })
      .filter(Boolean) as any;
  }

  // arrows
  const arrowsSrc = Array.isArray(scl?.arrow) ? scl.arrow : Array.isArray(scl?.arrows) ? scl.arrows : [];
  if (arrowsSrc.length) {
    cosmetics.arrows = arrowsSrc
      .map((a: any) => {
        const cellPath = parseCellRefs(a?.cells ?? a?.ce);
        const wpPath = (a?.wayPoints ?? []).map(asPoint).filter(Boolean) as Array<{ x: number; y: number }>;
        const path = cellPath.length
          ? cellPath
          : wpPath.map((p) => ({ r: p.y, c: p.x }));
        if (path.length < 2) return null;
        return { bulb: path[0], path };
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
        const wayPoints = (ln?.wayPoints ?? ln?.points ?? ln?.wp ?? [])
          .map(asPoint)
          .filter(Boolean) as Array<{ x: number; y: number }>;
        if (wayPoints.length < 2) return null;
        return {
          wayPoints,
          color: normalizeColorToken(ln?.color ?? ln?.c),
          thickness: typeof (ln?.thickness ?? ln?.th) === "number" ? (ln?.thickness ?? ln?.th) : undefined,
          target: typeof ln?.target === "string" ? ln.target : undefined,
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
    const thermoAsLines = thermometerLines
      .map((item: any) => {
        const path = parseCellRefs(item?.cells ?? item?.ce ?? item?.line ?? item);
        if (path.length < 2) return null;
        return {
          wayPoints: path.map((rc) => ({ x: rc.c + 0.5, y: rc.r + 0.5 })),
          color: normalizeColorToken(item?.color ?? "#9fd9ff"),
          thickness: typeof item?.thickness === "number" ? item.thickness : 10,
          target: "overlay",
        };
      })
      .filter(Boolean) as NonNullable<PuzzleCosmetics["lines"]>;
    cosmetics.lines = [...(cosmetics.lines ?? []), ...thermoAsLines];

    const thermoBulbs = thermometerLines
      .map((item: any) => {
        const path = parseCellRefs(item?.cells ?? item?.ce ?? item?.line ?? item);
        if (!path.length) return null;
        const first = path[0] as CellRC;
        return {
          center: { x: first.c + 0.5, y: first.r + 0.5 },
          width: 0.68,
          height: 0.68,
          rounded: true,
          color: normalizeColorToken(item?.bulbColor ?? item?.color ?? "#c9ecff"),
          borderColor: normalizeColorToken(item?.borderColor ?? "#6eaed6"),
          borderThickness: 1.2,
        };
      })
      .filter(Boolean) as NonNullable<PuzzleCosmetics["underlays"]>;
    if (thermoBulbs.length) cosmetics.underlays = [...(cosmetics.underlays ?? []), ...thermoBulbs];
  }

  const parseLayerItem = (item: any) => {
    const ct = asPoint(item?.center ?? item?.ct);
    if (!ct) return null;
    return {
      center: ct,
      width: typeof (item?.width ?? item?.w) === "number" ? (item?.width ?? item?.w) : undefined,
      height: typeof (item?.height ?? item?.h) === "number" ? (item?.height ?? item?.h) : undefined,
      rounded: Boolean(item?.rounded ?? item?.r),
      color: normalizeColorToken(item?.backgroundColor ?? item?.c2 ?? item?.fill),
      borderColor: normalizeColorToken(item?.borderColor ?? item?.stroke ?? item?.c ?? item?.c1),
      borderThickness: typeof (item?.thickness ?? item?.th) === "number" ? (item?.thickness ?? item?.th) : undefined,
      text: item?.text ?? item?.te,
      textColor: normalizeColorToken(item?.color ?? item?.textColor),
      textSize:
        typeof (item?.textSize ?? item?.fontSize ?? item?.fs) === "number"
          ? (item?.textSize ?? item?.fontSize ?? item?.fs)
          : undefined,
      angle: typeof item?.angle === "number" ? item.angle : undefined,
    };
  };

  const overlaysSrc = Array.isArray(scl?.overlays) ? scl.overlays : [];
  if (overlaysSrc.length) {
    cosmetics.overlays = overlaysSrc.map(parseLayerItem).filter(Boolean) as any;
  }

  const underlaysSrc = Array.isArray(scl?.underlays) ? scl.underlays : [];
  if (underlaysSrc.length) {
    cosmetics.underlays = underlaysSrc.map(parseLayerItem).filter(Boolean) as any;
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
      return {
        center,
        width: typeof item?.width === "number" ? item.width : span?.width,
        height: typeof item?.height === "number" ? item.height : span?.height,
        rounded: item?.rounded ?? item?.r ?? circleSrc.includes(item),
        color: normalizeColorToken(item?.backgroundColor ?? item?.baseC ?? item?.c2),
        borderColor: normalizeColorToken(item?.borderColor ?? item?.outlineC ?? item?.c1 ?? item?.c),
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
    const betweenAsLines = scl.betweenline
      .flatMap((item: any) => (Array.isArray(item?.lines) ? item.lines.map((line: any) => ({ cells: line, color: item?.color })) : [item]))
      .map((item: any) => {
        const path = parseCellRefs(item?.cells ?? item?.ce ?? item?.line ?? item);
        if (path.length < 2) return null;
        return {
          wayPoints: path.map((rc) => ({ x: rc.c + 0.5, y: rc.r + 0.5 })),
          color: normalizeColorToken(item?.color ?? "#9ba6bf"),
          thickness: typeof item?.thickness === "number" ? item.thickness : 8,
          target: "overlay",
        };
      })
      .filter(Boolean) as NonNullable<PuzzleCosmetics["lines"]>;
    if (betweenAsLines.length) cosmetics.lines = [...(cosmetics.lines ?? []), ...betweenAsLines];
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
      const rc = asRC(item?.cell ?? item?.rc ?? item?.ce);
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

  return cosmetics;
}