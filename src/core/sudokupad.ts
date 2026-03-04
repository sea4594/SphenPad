import { z } from "zod";
import { decompressFromBase64 } from "lz-string";
import { normalizePuzzleKey } from "./id";
import type { PuzzleDefinition, CellRC, PuzzleCosmetics } from "./model";

/**
 * SudokuPad has a public API endpoint used by their own tooling:
 * https://sudokupad.app/api/puzzle/<puzzleId> :contentReference[oaicite:1]{index=1}
 */
const API_BASE = "/sp-api/api/puzzle";

function timeout(ms: number) {
  return new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms));
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
  if (Array.isArray(rc) && rc.length >= 2) return { r: Number(rc[0]), c: Number(rc[1]) };
  return null;
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
    const url = `${API_BASE}/${sourceId.split("/").map(encodeURIComponent).join("/")}`;
    const res = await Promise.race([fetch(url), timeout(12000)]) as Response;
    payloadText = await res.text();
  }

  // Some API responses are already JSON; some are compressed strings.
  raw = tryParseJson(payloadText) ?? payloadText;

  // Canonicalize to “SCL object” (best-effort).
  const sclObj = coerceToScl(raw);

  const meta = {
    title: sclObj?.metadata?.title ?? sclObj?.metadata?.name ?? "",
    author: sclObj?.metadata?.author ?? "",
    rules: sclObj?.metadata?.rules ?? sclObj?.metadata?.rule ?? "",
  };

  const givens = extractGivens(sclObj);
  const cosmetics = extractCosmetics(sclObj);

  const key = normalizePuzzleKey(sourceId);
  const def: PuzzleDefinition = {
    id: key,
    sourceId,
    size: 9,
    meta,
    givens,
    cosmetics,
  };

  return { key, def, raw: sclObj ?? raw };
}

function coerceToScl(raw: any): any {
  // Case 1: already an object
  if (raw && typeof raw === "object") {
    const parsed = SclSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    return raw;
  }

  // Case 2: prefixed compressed payload: "scl<base64>"
  if (typeof raw === "string") {
    const s = raw.trim();

    const m = s.match(/^(scl|ctc)([\s\S]+)$/);
    if (m) {
      const b64 = m[2];
      const decompressed = decompressFromBase64(b64);
      const j = tryParseJson(decompressed);
      if (j) return j;
      const j2 = tryParseJson(decompressedFromMaybeZipped(decompressed));
      if (j2) return j2;
    }

    // If it's plain JSON text
    const j = tryParseJson(s);
    if (j) return j;

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
      if (cell?.value != null) out.push({ rc: { r, c }, v: String(cell.value) });
    }
  }
  return out;
}

function extractCosmetics(scl: any): PuzzleCosmetics {
  const cosmetics: PuzzleCosmetics = {};

  // background image (underlay)
  if (scl?.underlay?.image) cosmetics.backgroundImageUrl = String(scl.underlay.image);

  // cages
  if (Array.isArray(scl?.cages)) {
    cosmetics.cages = scl.cages
      .map((cg: any) => {
        const cells = (cg?.cells ?? []).map(asRC).filter(Boolean) as CellRC[];
        if (!cells.length) return null;
        return { cells, sum: cg?.value != null ? String(cg.value) : undefined, color: cg?.outlineC ?? undefined };
      })
      .filter(Boolean) as any;
  }

  // arrows
  if (Array.isArray(scl?.arrow)) {
    cosmetics.arrows = scl.arrow
      .map((a: any) => {
        const path = (a?.cells ?? []).map(asRC).filter(Boolean) as CellRC[];
        if (path.length < 2) return null;
        return { bulb: path[0], path };
      })
      .filter(Boolean) as any;
  }

  // dots
  if (Array.isArray(scl?.dots)) {
    cosmetics.dots = scl.dots
      .map((d: any) => {
        const cells = (d?.cells ?? []).map(asRC).filter(Boolean) as CellRC[];
        if (cells.length !== 2) return null;
        const kind = d?.type === "white" ? "white" : "black";
        return { a: cells[0], b: cells[1], kind };
      })
      .filter(Boolean) as any;
  }

  return cosmetics;
}