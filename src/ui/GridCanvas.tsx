import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import twemoji from "twemoji";
import { mapForcedPortraitPoint, readForcedPortraitDirection } from "../app/forcedPortrait";
import type { CellRC, PuzzleDefinition, PuzzleProgress } from "../core/model";
import { useTheme } from "../app/theme";

type LineKindResolved = "center" | "edge";
type LineKindStored = LineKindResolved | "both";
type EdgeTrack = "top" | "bottom" | "left" | "right";
type LineSegmentDraft = { a: CellRC; b: CellRC; edgeTrack?: EdgeTrack };
type LayerItem = NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>[number];
const LINE_NODE_DIAMETER = 1;
const LINE_NODE_RADIUS = LINE_NODE_DIAMETER / 2;
const TWEMOJI_OPTIONS = {
  base: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/",
  folder: "svg",
  ext: ".svg",
} as const;

function isLikelyMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const mobilePlatform = /android|iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const touchPrimaryInput = coarsePointer && window.navigator.maxTouchPoints > 1;
  return mobilePlatform || touchPrimaryInput;
}

type DragState = {
  path: CellRC[];
  segments: LineSegmentDraft[];
  last: CellRC;
  moved: boolean;
  lastClientX?: number;
  lastClientY?: number;
  edgeTapCandidate?: { a: CellRC; b: CellRC };
  lineKind?: LineKindResolved;
  lineAction?: "draw" | "erase";
  visited: Set<string>;
  selectionSet?: Set<string>;
  selectionMode?: "replace" | "add" | "remove";
  startedSelected?: boolean;
  startedCellKey?: string;
  startedSelectionSize?: number;
  startClientX?: number;
  startClientY?: number;
  selectionDragActive?: boolean;
};

function rcKey(rc: CellRC) {
  return `${rc.r},${rc.c}`;
}

function segKey(a: CellRC, b: CellRC) {
  const ak = rcKey(a);
  const bk = rcKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function lineKindNamespace(kind: LineKindStored): LineKindResolved {
  return kind === "edge" ? "edge" : "center";
}

function segKeyWithKind(seg: { a: CellRC; b: CellRC; edgeTrack?: EdgeTrack }, kind: LineKindStored) {
  return `${lineKindNamespace(kind)}:${segKey(seg.a, seg.b)}`;
}

export function GridCanvas(props: {
  def: PuzzleDefinition;
  progress: PuzzleProgress;
  onSelection: (sel: CellRC[]) => void;
  onLineStroke: (segments: LineSegmentDraft[], kind: LineKindResolved, action: "draw" | "erase") => void;
  onLineTapCell: (rc: CellRC) => void;
  onLineTapEdge: (a: CellRC, b: CellRC) => void;
  onDoubleCell: (rc: CellRC) => void;
  interactive?: boolean;
  previewMode?: boolean;
}) {
  const { def, progress, interactive = true, previewMode = false } = props;
  const { outlineDigits, conflictChecker } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const twemojiCacheRef = useRef<Map<string, HTMLImageElement | "loading" | "error">>(new Map());

  const rows = Math.max(1, Number(def.rows ?? progress.cells.length ?? def.size));
  const cols = Math.max(1, Number(def.cols ?? progress.cells[0]?.length ?? def.size));
  const sourceCellSize = Number(def.cosmetics.sourceCellSize);
  const cosmeticUnit = Number.isFinite(sourceCellSize) && sourceCellSize > 0 ? sourceCellSize : 56;
  const [cellPx, setCellPx] = useState(56);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [linePreview, setLinePreview] = useState<{ segments: LineSegmentDraft[]; kind: LineKindResolved } | null>(null);
  const [emojiRenderVersion, setEmojiRenderVersion] = useState(0);
  const [mobileViewport, setMobileViewport] = useState(() => isLikelyMobileDevice());

  const basePad = Math.max(14, Math.round(cellPx * 0.32));
  const pad = previewMode
    ? Math.max(2, Math.round(basePad * 0.16))
    : mobileViewport
      ? Math.max(3, Math.round(basePad * 0.2))
      : basePad;
  const worldBounds = useMemo(() => {
    let minX = 0;
    let minY = 0;
    let maxX = cols;
    let maxY = rows;

    const includePoint = (x?: number, y?: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x as number);
      minY = Math.min(minY, y as number);
      maxX = Math.max(maxX, x as number);
      maxY = Math.max(maxY, y as number);
    };

    const includeLayer = (item: LayerItem) => {
      const cx = item?.center?.x;
      const cy = item?.center?.y;
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

      const hasExplicitBox = Number.isFinite(item?.width) || Number.isFinite(item?.height);
      const hasShape = Boolean(item?.color || item?.borderColor || item?.rounded);
      const w = Number.isFinite(item?.width) ? Number(item.width) : hasShape || hasExplicitBox ? 1 : 0;
      const h = Number.isFinite(item?.height) ? Number(item.height) : hasShape || hasExplicitBox ? 1 : 0;
      // Text-only labels near/above grid edges need extra bounds so glyphs are not clipped.
      const text = item?.text == null ? "" : String(item.text);
      const hasText = text.trim().length > 0;
      if ((w <= 0 && h <= 0) && !hasText) return;

      const angleRad = ((Number(item?.angle) || 0) * Math.PI) / 180;
      const halfW = Math.max(0, w / 2);
      const halfH = Math.max(0, h / 2);
      const cosA = Math.abs(Math.cos(angleRad));
      const sinA = Math.abs(Math.sin(angleRad));
      const boundsHalfW = halfW * cosA + halfH * sinA;
      const boundsHalfH = halfW * sinA + halfH * cosA;
      const borderPad = Math.max(0, ((item?.borderThickness ?? 0) / cosmeticUnit) / 2);

      includePoint(cx, cy);
      const textSize = Number.isFinite(item?.textSize) ? Number(item.textSize) : 16;
      const textHalfHeight = Math.max(0.42, (textSize / cosmeticUnit) * 0.98);
      const textHalfWidth = Math.max(0.5, Math.min(5.2, (Math.max(1, text.length) * textSize) / 108));
      if (w <= 0 && h <= 0) {
        includePoint(cx - textHalfWidth, cy - textHalfHeight);
        includePoint(cx + textHalfWidth, cy + textHalfHeight);
        return;
      }
      includePoint(
        cx - Math.max(boundsHalfW + borderPad, hasText ? textHalfWidth : 0),
        cy - Math.max(boundsHalfH + borderPad, hasText ? textHalfHeight : 0)
      );
      includePoint(
        cx + Math.max(boundsHalfW + borderPad, hasText ? textHalfWidth : 0),
        cy + Math.max(boundsHalfH + borderPad, hasText ? textHalfHeight : 0)
      );
    };

    for (const item of def.cosmetics.overlays ?? []) includeLayer(item);
    for (const item of def.cosmetics.underlays ?? []) includeLayer(item);
    for (const ln of def.cosmetics.lines ?? []) {
      for (const p of ln.wayPoints) includePoint(p.x, p.y);
      const strokePad = Math.max(0.12, ((ln.thickness ?? 6) / cosmeticUnit) * 0.7);
      for (const p of ln.wayPoints) {
        includePoint(p.x - strokePad, p.y - strokePad);
        includePoint(p.x + strokePad, p.y + strokePad);
      }
    }

    return { minX, minY, maxX, maxY };
  }, [cols, cosmeticUnit, def.cosmetics.lines, def.cosmetics.overlays, def.cosmetics.underlays, rows]);

  const outsideLeft = Math.max(0, -worldBounds.minX);
  const outsideTop = Math.max(0, -worldBounds.minY);
  const outsideRight = Math.max(0, worldBounds.maxX - cols);
  const outsideBottom = Math.max(0, worldBounds.maxY - rows);

  const originX = pad + outsideLeft * cellPx;
  const originY = pad + outsideTop * cellPx;
  const boardW = cellPx * (cols + outsideLeft + outsideRight);
  const boardH = cellPx * (rows + outsideTop + outsideBottom);
  const widthPx = Math.max(1, Math.ceil(pad * 2 + boardW));
  const heightPx = Math.max(1, Math.ceil(pad * 2 + boardH));

  const worldX = useCallback((x: number) => originX + x * cellPx, [originX, cellPx]);
  const worldY = useCallback((y: number) => originY + y * cellPx, [originY, cellPx]);
  const cellX = useCallback((c: number) => originX + c * cellPx, [originX, cellPx]);
  const cellY = useCallback((r: number) => originY + r * cellPx, [originY, cellPx]);

  const twemojiVariantKey = useCallback((text: string): string | null => {
    const value = text.trim();
    if (!value) return null;
    const canonical = twemoji.convert.toCodePoint(value);
    return canonical || null;
  }, []);

  const resolveTwemojiUrl = useCallback((text: string): string | null => {
    const parsed = twemoji.parse(text.trim(), TWEMOJI_OPTIONS);
    if (!parsed || parsed === text.trim()) return null;

    const srcMatch = parsed.match(/src="([^"]+)"/i);
    return srcMatch?.[1] ?? null;
  }, []);

  const getTwemojiImage = useCallback((text: string): HTMLImageElement | null => {
    const key = twemojiVariantKey(text);
    if (!key) return null;

    const cached = twemojiCacheRef.current.get(key);
    if (cached instanceof HTMLImageElement) return cached;
    if (cached === "loading" || cached === "error") return null;

    twemojiCacheRef.current.set(key, "loading");

    const url = resolveTwemojiUrl(text);
    if (!url) {
      twemojiCacheRef.current.set(key, "error");
      return null;
    }

    void (() => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        twemojiCacheRef.current.set(key, img);
        setEmojiRenderVersion((value) => value + 1);
      };
      img.onerror = () => {
        twemojiCacheRef.current.set(key, "error");
      };
      img.src = url;
    })();

    return null;
  }, [resolveTwemojiUrl, twemojiVariantKey]);

  const highlightRotationRad = (20 * Math.PI) / 180;
  const highlightAlpha = 0.82;
  const gridTextFont = '"Lato", "Noto Sans", "Segoe UI", ui-sans-serif, sans-serif';
  const emojiTextFont = useMemo(() => {
    const candidates = [
      "Noto Color Emoji",
      "Apple Color Emoji",
      "Segoe UI Emoji",
      "Noto Emoji",
      "EmojiOne Color",
      "Twemoji Mozilla",
    ];
    const fallback = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", emoji, sans-serif';
    if (typeof document === "undefined" || !("fonts" in document)) return fallback;

    const available = candidates.filter((name) => {
      try {
        return document.fonts.check(`16px "${name}"`);
      } catch {
        return false;
      }
    });

    if (!available.length) return fallback;
    return `${available.map((name) => `"${name}"`).join(", ")}, emoji, sans-serif`;
  }, []);

  const centerLineKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const stroke of progress.lines) {
      if (stroke.kind !== "center") continue;
      for (const seg of stroke.segments) keys.add(segKey(seg.a, seg.b));
    }
    return keys;
  }, [progress.lines]);

  const edgeLineKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const stroke of progress.lines) {
      if (stroke.kind !== "edge") continue;
      for (const seg of stroke.segments) keys.add(segKey(seg.a, seg.b));
    }
    return keys;
  }, [progress.lines]);

  const inBounds = useCallback((r: number, c: number) => {
    return r >= 0 && c >= 0 && r < rows && c < cols;
  }, [cols, rows]);

  function keyToRc(key: string): CellRC {
    const [r, c] = key.split(",").map((v) => Number(v));
    return { r, c };
  }

  function darkenColor(hex: string, amount = 0.2): string {
    const s = hex.trim();
    if (!s.startsWith("#")) return hex;
    const h = s.slice(1);
    if (![3, 4, 6, 8].includes(h.length)) return hex;
    const full = h.length <= 4
      ? h.split("").map((ch) => ch + ch).join("")
      : h;
    const rgb = full.slice(0, 6);
    const a = full.length === 8 ? full.slice(6) : "";
    const n = Number.parseInt(rgb, 16);
    if (!Number.isFinite(n)) return hex;
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 0xff) * (1 - amount))));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 0xff) * (1 - amount))));
    const b = Math.max(0, Math.min(255, Math.round((n & 0xff) * (1 - amount))));
    const body = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
    return `#${body}${a}`;
  }

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const boardCard = (el.closest(".boardCard") as HTMLElement | null) ?? (el.parentElement as HTMLElement | null) ?? null;
      const boardColumn = (el.closest(".boardColumn") as HTMLElement | null) ?? null;
      const gridLayout = (el.closest(".gridLayout") as HTMLElement | null) ?? null;
      const pane = boardCard ?? boardColumn ?? el;
      const longSide = Math.max(window.innerWidth, window.innerHeight);
      const isMobile = isLikelyMobileDevice();

      const width = Math.max(1, el.clientWidth || pane.clientWidth || window.innerWidth);

      const topbar = document.querySelector(".topbar") as HTMLElement | null;
      const normalizedViewportHeight = isMobile ? longSide : window.innerHeight;
      const viewportHeight = Math.max(180, normalizedViewportHeight - (topbar?.offsetHeight ?? 0) - 16);
      const measuredHeight = Math.max(
        boardCard?.clientHeight ?? 0,
        boardColumn?.clientHeight ?? 0,
        gridLayout?.clientHeight ?? 0,
        pane.clientHeight || 0
      );

      const height = previewMode
        ? Math.max(1, measuredHeight || el.clientHeight || pane.clientHeight || viewportHeight)
        : isMobile
          ? Math.max(160, viewportHeight)
          : measuredHeight > 220
            ? measuredHeight
            : viewportHeight;

      const sideMargin = previewMode ? 0 : 8;
      const topBottomPad = previewMode ? 0 : 8;
      const spanX = cols + outsideLeft + outsideRight;
      const spanY = rows + outsideTop + outsideBottom;
      const padFactor = isMobile ? 0.14 : 0.68;
      const availableWidth = Math.max(previewMode ? 1 : 240, width - sideMargin * 2);
      const availableHeight = Math.max(previewMode ? 1 : 220, height - topBottomPad * 2);
      const byWidth = availableWidth / (spanX + padFactor);
      const byHeight = availableHeight / (spanY + padFactor);

      const desktop = !isMobile && window.matchMedia("(hover: hover) and (pointer: fine)").matches && longSide >= 1080;
      const mobileMinCell = 21;
      const desktopMinCell = 14;
      const maxCell = desktop ? 96 : 72;
      const minCell = previewMode ? 2 : isMobile ? mobileMinCell : desktopMinCell;
      let next = Math.floor(Math.min(maxCell, Math.max(minCell, Math.min(byWidth, byHeight))));

      const fits = (cell: number) => {
        const basePadding = Math.max(14, Math.round(cell * 0.32));
        const padding = previewMode
          ? Math.max(2, Math.round(basePadding * 0.16))
          : isMobile
            ? Math.max(3, Math.round(basePadding * 0.2))
            : basePadding;
        const fullWidth = padding * 2 + spanX * cell;
        const fullHeight = padding * 2 + spanY * cell;
        return fullWidth <= availableWidth && fullHeight <= availableHeight;
      };

      while (next > minCell && !fits(next)) next -= 1;
      if (!isMobile) {
        while (next > 8 && !fits(next)) next -= 1;
      }

      setCellPx(next);
      setMobileViewport(isMobile);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [cols, outsideBottom, outsideLeft, outsideRight, outsideTop, previewMode, rows]);

  useEffect(() => {
    if (!def.cosmetics.backgroundImageUrl) {
      queueMicrotask(() => setBgImage(null));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setBgImage(img);
    img.onerror = () => setBgImage(null);
    img.src = def.cosmetics.backgroundImageUrl;
  }, [def.cosmetics.backgroundImageUrl]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    cv.width = widthPx * devicePixelRatio;
    cv.height = heightPx * devicePixelRatio;
    cv.style.width = `${widthPx}px`;
    cv.style.height = `${heightPx}px`;

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, widthPx, heightPx);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Keep the full Sudoku grid area pure white regardless of global theme.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cellX(0), cellY(0), cellPx * cols, cellPx * rows);

    if (bgImage) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(bgImage, cellX(0), cellY(0), cellPx * cols, cellPx * rows);
      ctx.globalAlpha = 1;
    }

    const unitScale = cellPx / cosmeticUnit;
    const scaledCosmeticPx = (
      sourcePx: number,
      options?: { previewMin?: number; normalMin?: number; max?: number },
    ) => {
      const previewMin = options?.previewMin ?? 0;
      const normalMin = options?.normalMin ?? 0;
      const max = options?.max ?? Number.POSITIVE_INFINITY;
      return Math.min(max, Math.max(previewMode ? previewMin : normalMin, sourcePx * unitScale));
    };
    const scaledCellPx = (
      ratio: number,
      options?: { previewMin?: number; normalMin?: number; max?: number },
    ) => {
      const previewMin = options?.previewMin ?? 0;
      const normalMin = options?.normalMin ?? 0;
      const max = options?.max ?? Number.POSITIVE_INFINITY;
      return Math.min(max, Math.max(previewMode ? previewMin : normalMin, cellPx * ratio));
    };

    const drawCellHighlights = (r: number, c: number, colors: string[], alpha = highlightAlpha) => {
      if (!colors.length) return;
      const x = cellX(c);
      const y = cellY(r);
      const cx = x + cellPx / 2;
      const cy = y + cellPx / 2;

      const radius = cellPx * 0.78;
      const maxSlices = Math.min(18, colors.length);
      const step = (Math.PI * 2) / maxSlices;
      const offset = -Math.PI / 2;
      ctx.save();
      // Clip in unrotated cell space, then rotate color wedges before drawing.
      ctx.beginPath();
      ctx.rect(x, y, cellPx, cellPx);
      ctx.clip();
      ctx.translate(cx, cy);
      ctx.rotate(highlightRotationRad);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = alpha;
      for (let i = 0; i < maxSlices; i++) {
        const start = offset + i * step;
        const end = start + step;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, start, end);
        ctx.closePath();
        ctx.fillStyle = colors[i] as string;
        ctx.fill();
      }
      ctx.restore();
    };

    const drawSelectionOutlines = () => {
      if (!interactive || !progress.selection.length) return;
      const selected = new Set(progress.selection.map(rcKey));
      const inset = 1;
      ctx.save();
      ctx.strokeStyle = "rgba(46,120,255,.95)";
      ctx.lineWidth = 3.3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const rc of progress.selection) {
        const x = cellX(rc.c);
        const y = cellY(rc.r);
        if (!selected.has(`${rc.r - 1},${rc.c}`)) {
          ctx.beginPath();
          ctx.moveTo(x + inset, y + inset);
          ctx.lineTo(x + cellPx - inset, y + inset);
          ctx.stroke();
        }
        if (!selected.has(`${rc.r},${rc.c + 1}`)) {
          ctx.beginPath();
          ctx.moveTo(x + cellPx - inset, y + inset);
          ctx.lineTo(x + cellPx - inset, y + cellPx - inset);
          ctx.stroke();
        }
        if (!selected.has(`${rc.r + 1},${rc.c}`)) {
          ctx.beginPath();
          ctx.moveTo(x + inset, y + cellPx - inset);
          ctx.lineTo(x + cellPx - inset, y + cellPx - inset);
          ctx.stroke();
        }
        if (!selected.has(`${rc.r},${rc.c - 1}`)) {
          ctx.beginPath();
          ctx.moveTo(x + inset, y + inset);
          ctx.lineTo(x + inset, y + cellPx - inset);
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    const regionByCell = new Map<string, number>();
    const importedRegions = def.cosmetics.irregularRegions ?? [];
    importedRegions.forEach((region, idx) => {
      for (const rc of region.cells) {
        if (!inBounds(rc.r, rc.c)) continue;
        regionByCell.set(`${rc.r},${rc.c}`, idx);
      }
    });
    const hasImportedRegionBoundaries = regionByCell.size > 0;
    const subgrid = def.cosmetics.subgrid;
    const puzzleConflictChecker = def.cosmetics.conflictChecker !== false;

    // Hidden `rowcol` areas define custom row/column domains in many SudokuPad variants.
    const rowColDomainKeys = new Set<string>();
    for (const rc of def.cosmetics.rowColCells ?? []) {
      if (!inBounds(rc.r, rc.c)) continue;
      rowColDomainKeys.add(`${rc.r},${rc.c}`);
    }
    const rowColAreas = (def.cosmetics.rowColAreas ?? [])
      .map((area) => {
        const areaSeen = new Set<string>();
        const areaCells: CellRC[] = [];
        for (const rc of area) {
          if (!inBounds(rc.r, rc.c)) continue;
          const key = `${rc.r},${rc.c}`;
          if (areaSeen.has(key)) continue;
          areaSeen.add(key);
          areaCells.push(rc);
          rowColDomainKeys.add(key);
        }
        return areaCells;
      })
      .filter((area) => area.length > 0);

    const hasCustomRowColAreas = rowColAreas.length > 0;
    const hasExplicitRowColDomain = rowColDomainKeys.size > 0;
    const hasDomainRestriction = hasExplicitRowColDomain || hasImportedRegionBoundaries;

    const conflictDomainByCell: boolean[][] = Array.from(
      { length: rows },
      () => Array.from({ length: cols }, () => !hasDomainRestriction),
    );
    if (hasExplicitRowColDomain) {
      for (const key of rowColDomainKeys) {
        const [rRaw, cRaw] = key.split(",");
        const r = Number(rRaw);
        const c = Number(cRaw);
        if (!Number.isFinite(r) || !Number.isFinite(c) || !inBounds(r, c)) continue;
        conflictDomainByCell[r][c] = true;
      }
    } else if (hasImportedRegionBoundaries) {
      for (const key of regionByCell.keys()) {
        const [rRaw, cRaw] = key.split(",");
        const r = Number(rRaw);
        const c = Number(cRaw);
        if (!Number.isFinite(r) || !Number.isFinite(c) || !inBounds(r, c)) continue;
        conflictDomainByCell[r][c] = true;
      }
    }

    let rowColDomainMinRow = 0;
    let rowColDomainMinCol = 0;
    if (hasExplicitRowColDomain) {
      rowColDomainMinRow = rows;
      rowColDomainMinCol = cols;
      for (const key of rowColDomainKeys) {
        const [rRaw, cRaw] = key.split(",");
        const r = Number(rRaw);
        const c = Number(cRaw);
        if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
        rowColDomainMinRow = Math.min(rowColDomainMinRow, r);
        rowColDomainMinCol = Math.min(rowColDomainMinCol, c);
      }
      if (!Number.isFinite(rowColDomainMinRow)) rowColDomainMinRow = 0;
      if (!Number.isFinite(rowColDomainMinCol)) rowColDomainMinCol = 0;
    }

    const normalizeSymbol = (symbol: string | undefined): string | null => {
      const trimmed = symbol?.trim() ?? "";
      return trimmed.length ? trimmed : null;
    };

    const normalizeComparisonSymbol = (symbol: string | undefined): string => {
      const trimmed = symbol?.trim() ?? "";
      return trimmed.length ? trimmed.toUpperCase() : "";
    };

    const boxKeyByCell: Array<Array<string | null>> = Array.from(
      { length: rows },
      () => Array.from({ length: cols }, () => null),
    );
    if (regionByCell.size > 0) {
      for (const [key, regionIndex] of regionByCell.entries()) {
        const [rRaw, cRaw] = key.split(",");
        const r = Number(rRaw);
        const c = Number(cRaw);
        if (!Number.isFinite(r) || !Number.isFinite(c) || !inBounds(r, c)) continue;
        boxKeyByCell[r][c] = `region:${regionIndex}`;
      }
    } else if (subgrid && subgrid.r > 0 && subgrid.c > 0) {
      const rowBase = hasExplicitRowColDomain ? rowColDomainMinRow : 0;
      const colBase = hasExplicitRowColDomain ? rowColDomainMinCol : 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (hasExplicitRowColDomain && !conflictDomainByCell[r][c]) continue;
          const br = Math.floor((r - rowBase) / subgrid.r);
          const bc = Math.floor((c - colBase) / subgrid.c);
          boxKeyByCell[r][c] = `subgrid:${br},${bc}`;
        }
      }
    }

    const addCount = (map: Map<string, number>, symbol: string) => {
      map.set(symbol, (map.get(symbol) ?? 0) + 1);
    };

    const rowColAreaIdsByCell = new Map<string, number[]>();
    const rowColAreaValueCounts = rowColAreas.map(() => new Map<string, number>());
    if (hasCustomRowColAreas) {
      rowColAreas.forEach((area, idx) => {
        for (const rc of area) {
          if (!conflictDomainByCell[rc.r][rc.c]) continue;
          const key = `${rc.r},${rc.c}`;
          const ids = rowColAreaIdsByCell.get(key);
          if (ids) ids.push(idx);
          else rowColAreaIdsByCell.set(key, [idx]);

          const symbol = normalizeSymbol(progress.cells[rc.r][rc.c].value);
          if (!symbol) continue;
          addCount(rowColAreaValueCounts[idx] as Map<string, number>, symbol);
        }
      });
    }

    const rowValueCounts = Array.from({ length: rows }, () => new Map<string, number>());
    const colValueCounts = Array.from({ length: cols }, () => new Map<string, number>());
    const boxValueCounts = new Map<string, Map<string, number>>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!conflictDomainByCell[r][c]) continue;
        const symbol = normalizeSymbol(progress.cells[r][c].value);
        if (!symbol) continue;

        if (!hasCustomRowColAreas) {
          addCount(rowValueCounts[r], symbol);
          addCount(colValueCounts[c], symbol);
        }

        const boxKey = boxKeyByCell[r][c];
        if (!boxKey) continue;
        let boxCounts = boxValueCounts.get(boxKey);
        if (!boxCounts) {
          boxCounts = new Map<string, number>();
          boxValueCounts.set(boxKey, boxCounts);
        }
        addCount(boxCounts, symbol);
      }
    }

    const hasBigValuePeer = (r: number, c: number, symbol: string): boolean => {
      if (!conflictChecker || !puzzleConflictChecker) return false;
      if (!conflictDomainByCell[r][c]) return false;

      const selfSymbol = normalizeSymbol(progress.cells[r][c].value);
      const subtractSelf = selfSymbol === symbol ? 1 : 0;

      if (hasCustomRowColAreas) {
        const ids = rowColAreaIdsByCell.get(`${r},${c}`) ?? [];
        for (const id of ids) {
          const peers = (rowColAreaValueCounts[id]?.get(symbol) ?? 0) - subtractSelf;
          if (peers > 0) return true;
        }
      } else {
        const rowPeers = (rowValueCounts[r].get(symbol) ?? 0) - subtractSelf;
        if (rowPeers > 0) return true;

        const colPeers = (colValueCounts[c].get(symbol) ?? 0) - subtractSelf;
        if (colPeers > 0) return true;
      }

      const boxKey = boxKeyByCell[r][c];
      if (!boxKey) return false;
      const boxPeers = (boxValueCounts.get(boxKey)?.get(symbol) ?? 0) - subtractSelf;
      return boxPeers > 0;
    };

    const drawRegionBoundaries = (thickGridLine: number) => {
      if (!hasImportedRegionBoundaries) return;
      ctx.lineWidth = thickGridLine;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const id = regionByCell.get(`${r},${c}`);
          if (id == null) continue;

          if (r === 0 || regionByCell.get(`${r - 1},${c}`) !== id) {
            ctx.beginPath();
            ctx.moveTo(cellX(c), cellY(r));
            ctx.lineTo(cellX(c + 1), cellY(r));
            ctx.stroke();
          }
          if (c === 0 || regionByCell.get(`${r},${c - 1}`) !== id) {
            ctx.beginPath();
            ctx.moveTo(cellX(c), cellY(r));
            ctx.lineTo(cellX(c), cellY(r + 1));
            ctx.stroke();
          }
          if (r === rows - 1) {
            ctx.beginPath();
            ctx.moveTo(cellX(c), cellY(r + 1));
            ctx.lineTo(cellX(c + 1), cellY(r + 1));
            ctx.stroke();
          }
          if (c === cols - 1) {
            ctx.beginPath();
            ctx.moveTo(cellX(c + 1), cellY(r));
            ctx.lineTo(cellX(c + 1), cellY(r + 1));
            ctx.stroke();
          }
        }
      }
    };

    const drawGridLines = () => {
      if (def.cosmetics.gridVisible === false) return;
      const thinGridLine = scaledCosmeticPx(1.0, { previewMin: 0.45, normalMin: 0.9 });
      const thickGridLine = scaledCosmeticPx(2.2, { previewMin: 0.9, normalMin: 1.8 });
      ctx.strokeStyle = "#000000";
      for (let i = 0; i <= rows; i++) {
        ctx.lineWidth = thinGridLine;
        ctx.beginPath();
        ctx.moveTo(cellX(0), cellY(i));
        ctx.lineTo(cellX(cols), cellY(i));
        ctx.stroke();
      }

      for (let i = 0; i <= cols; i++) {
        ctx.lineWidth = thinGridLine;
        ctx.beginPath();
        ctx.moveTo(cellX(i), cellY(0));
        ctx.lineTo(cellX(i), cellY(rows));
        ctx.stroke();
      }

      if (hasImportedRegionBoundaries) {
        drawRegionBoundaries(thickGridLine);
      } else if (subgrid) {
        for (let i = 0; i <= rows; i++) {
          if (i % subgrid.r !== 0) continue;
          ctx.lineWidth = thickGridLine;
          ctx.beginPath();
          ctx.moveTo(cellX(0), cellY(i));
          ctx.lineTo(cellX(cols), cellY(i));
          ctx.stroke();
        }

        for (let i = 0; i <= cols; i++) {
          if (i % subgrid.c !== 0) continue;
          ctx.lineWidth = thickGridLine;
          ctx.beginPath();
          ctx.moveTo(cellX(i), cellY(0));
          ctx.lineTo(cellX(i), cellY(rows));
          ctx.stroke();
        }
      }
    };

    const drawLayerItem = (item: NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>[number]) => {
      const w = Number.isFinite(item.width) ? item.width! : 1;
      const h = Number.isFinite(item.height) ? item.height! : 1;
      const x = worldX(item.center.x - w / 2);
      const y = worldY(item.center.y - h / 2);
      const rw = w * cellPx;
      const rh = h * cellPx;
      const cx = worldX(item.center.x);
      const cy = worldY(item.center.y);
      const angleRad = (Number(item.angle) || 0) * (Math.PI / 180);
      const itemOpacity = Number.isFinite(item.opacity) ? Math.max(0, Math.min(1, Number(item.opacity))) : 1;
      const nearlyCircle = Math.abs(rw - rh) <= Math.max(1, cellPx * 0.02);

      const drawShapePath = (mode: "fill" | "stroke", inset = 0) => {
        const sx = x + inset;
        const sy = y + inset;
        const sw = Math.max(0, rw - inset * 2);
        const sh = Math.max(0, rh - inset * 2);
        if (mode === "fill") {
          if (item.rounded) {
            if (nearlyCircle) {
              ctx.beginPath();
              ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.beginPath();
              ctx.roundRect(x, y, rw, rh, Math.min(14, cellPx * 0.25));
              ctx.fill();
            }
          } else {
            ctx.fillRect(x, y, rw, rh);
          }
          return;
        }

        if (item.rounded) {
          if (nearlyCircle) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.roundRect(sx, sy, sw, sh, Math.min(14, cellPx * 0.25));
            ctx.stroke();
          }
        } else {
          ctx.strokeRect(sx, sy, sw, sh);
        }
      };

      ctx.save();
      ctx.globalAlpha *= itemOpacity;
      if (angleRad) {
        ctx.translate(cx, cy);
        ctx.rotate(angleRad);
        ctx.translate(-cx, -cy);
      }

      if (item.color) {
        ctx.fillStyle = item.color;
        drawShapePath("fill");
      }

      if (item.borderColor) {
        const explicitBorderThickness = Number.isFinite(item.borderThickness)
          ? Number(item.borderThickness)
          : undefined;
        if (explicitBorderThickness == null || explicitBorderThickness > 0) {
          const borderWidth = (explicitBorderThickness ?? 1.4) * (cellPx / cosmeticUnit);
          if (borderWidth > 0) {
            ctx.strokeStyle = item.borderColor;
            ctx.lineWidth = borderWidth;
            ctx.lineCap = item.lineCap ?? "butt";
            ctx.lineJoin = item.lineJoin ?? "miter";
            if (item.dashArray?.length) {
              ctx.setLineDash(item.dashArray.map((value) => scaledCosmeticPx(value, { previewMin: 0.5, normalMin: 1 })));
            }
            if (Number.isFinite(item.dashOffset)) {
              ctx.lineDashOffset = scaledCosmeticPx(Number(item.dashOffset), { previewMin: 0, normalMin: 0 });
            }
            drawShapePath("stroke", borderWidth / 2);
          }
        }
      }

      if (item.text != null && String(item.text).length) {
        const px = (item.textSize ?? 16) * (cellPx / cosmeticUnit);
        const text = String(item.text);
        const hasEmoji = /\p{Extended_Pictographic}/u.test(text);
        const textPx = Math.max(previewMode ? 4.5 : 10, px);
        ctx.font = hasEmoji
          ? `${textPx}px ${emojiTextFont}`
          : `600 ${textPx}px ${gridTextFont}, ${emojiTextFont}`;
        ctx.textAlign = item.textAlign ?? "center";
        ctx.textBaseline = item.textBaseline ?? "middle";
        const tx = worldX(item.center.x);
        const ty = worldY(item.center.y);
        const textStrokeWidth = Number.isFinite(item.textStrokeWidth)
          ? scaledCosmeticPx(Number(item.textStrokeWidth), { previewMin: 0, normalMin: 0 })
          : 0;
        if (item.textStrokeColor && textStrokeWidth > 0 && !hasEmoji) {
          ctx.strokeStyle = item.textStrokeColor;
          ctx.lineWidth = textStrokeWidth;
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          ctx.strokeText(text, tx, ty);
        }
        ctx.fillStyle = item.textColor ?? "#111111";
        const twemojiImage = hasEmoji ? getTwemojiImage(text) : null;
        if (twemojiImage) {
          const sz = textPx;
          ctx.drawImage(twemojiImage, tx - sz / 2, ty - sz / 2, sz, sz);
        } else {
          ctx.fillText(text, tx, ty);
        }
      }

      ctx.restore();
    };

    type VisualTargetLayer = "under" | "arrows" | "cages" | "grid" | "over";

    const classifyRenderTarget = (target?: string): VisualTargetLayer => {
      const t = (target ?? "").toLowerCase();
      if (/(^|[^a-z])(cell-?grids?|gridlayer)([^a-z]|$)/.test(t)) return "grid";
      if (/(^|[^a-z])(arrows?|line)([^a-z]|$)/.test(t)) return "arrows";
      if (/(^|[^a-z])(cages?)([^a-z]|$)/.test(t)) return "cages";
      if (/(^|[^a-z])(under|underlay|back|background|behind|below|bottom)([^a-z]|$)/.test(t)) return "under";
      if (/(^|[^a-z])(cell-?colors?)([^a-z]|$)/.test(t)) return "under";
      return "over";
    };

    const classifyRenderTargetWithDefault = (
      target: string | undefined,
      fallback: VisualTargetLayer,
    ) => {
      if (typeof target !== "string" || !target.trim()) return fallback;
      return classifyRenderTarget(target);
    };

    const hasMatchingCornerLabel = (cageCells: CellRC[], sum: string) => {
      const labels = [...(def.cosmetics.overlays ?? []), ...(def.cosmetics.underlays ?? [])];
      const expected = String(sum).trim();
      const cageSet = new Set(cageCells.map((cell) => `${cell.r},${cell.c}`));
      return labels.some((item) => {
        const txt = item.text == null ? "" : String(item.text).trim();
        if (!txt || txt !== expected) return false;
        const cx = item?.center?.x;
        const cy = item?.center?.y;
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
        const cellC = Math.floor(Number(cx));
        const cellR = Math.floor(Number(cy));
        return cageSet.has(`${cellR},${cellC}`);
      });
    };

    const drawConstraintLine = (ln: NonNullable<PuzzleDefinition["cosmetics"]["lines"]>[number]) => {
      if (ln.wayPoints.length < 2) return;
      const lineOpacity = Number.isFinite(ln.opacity) ? Math.max(0, Math.min(1, Number(ln.opacity))) : 1;

      const hasSvgPath = typeof ln.svgPathData === "string" && ln.svgPathData.length > 0;
      if (hasSvgPath) {
        const units = Number(ln.svgUnitsPerCell) || cosmeticUnit;
        const path = new Path2D(ln.svgPathData as string);
        ctx.save();
        ctx.globalAlpha *= lineOpacity;
        ctx.translate(originX, originY);
        ctx.scale(cellPx / units, cellPx / units);
        if (ln.dashArray?.length) ctx.setLineDash(ln.dashArray);
        if (Number.isFinite(ln.dashOffset)) ctx.lineDashOffset = Number(ln.dashOffset);
        if (ln.fillColor) {
          ctx.fillStyle = ln.fillColor;
          ctx.fill(path);
        }
        const hasStroke = Boolean(ln.color) && (ln.thickness ?? 6) > 0;
        if (hasStroke) {
          ctx.strokeStyle = ln.color as string;
          ctx.lineWidth = ln.thickness ?? 6;
          ctx.lineCap = ln.lineCap ?? "round";
          ctx.lineJoin = ln.lineJoin ?? "round";
          ctx.stroke(path);
        }
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.globalAlpha *= lineOpacity;
      if (ln.dashArray?.length) {
        ctx.setLineDash(ln.dashArray.map((value) => scaledCosmeticPx(value, { previewMin: 0.5, normalMin: 1 })));
      }
      if (Number.isFinite(ln.dashOffset)) {
        ctx.lineDashOffset = scaledCosmeticPx(Number(ln.dashOffset), { previewMin: 0, normalMin: 0 });
      }
      ctx.beginPath();
      ln.wayPoints.forEach((p, i) => {
        const x = worldX(p.x);
        const y = worldY(p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (ln.closePath) ctx.closePath();

      if (ln.fillColor) {
        ctx.fillStyle = ln.fillColor;
        ctx.fill();
      }

      const hasStroke = Boolean(ln.color) && (ln.thickness ?? 6) > 0;
      if (hasStroke) {
        ctx.strokeStyle = ln.color as string;
        ctx.lineWidth = (ln.thickness ?? 6) * (cellPx / cosmeticUnit);
        ctx.lineCap = ln.lineCap ?? "round";
        ctx.lineJoin = ln.lineJoin ?? "round";
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawCage = (cage: NonNullable<PuzzleDefinition["cosmetics"]["cages"]>[number]) => {
      const cageOpacity = Number.isFinite(cage.opacity) ? Math.max(0, Math.min(1, Number(cage.opacity))) : 1;
      const cageStroke = cage.color ?? "#000000";
      const cageLineWidth = scaledCosmeticPx(cage.thickness ?? 1.25, { previewMin: 0.5, normalMin: 0.9 });
      const cageDash = (cage.dashArray?.length ? cage.dashArray : [5, 3])
        .map((value) => scaledCosmeticPx(value, { previewMin: 0.5, normalMin: 1 }));
      const set = new Set(cage.cells.map((rc) => `${rc.r},${rc.c}`));
      for (const rc of cage.cells) {
        if (cage.fillColor) {
          ctx.save();
          ctx.globalAlpha *= cageOpacity;
          ctx.fillStyle = cage.fillColor;
          ctx.fillRect(cellX(rc.c), cellY(rc.r), cellPx, cellPx);
          ctx.restore();
        }
        const x = cellX(rc.c);
        const y = cellY(rc.r);
        const inset = scaledCellPx(0.055, { previewMin: 0.8, normalMin: 2, max: 3 });
        const neighbors = {
          up: `${rc.r - 1},${rc.c}`,
          right: `${rc.r},${rc.c + 1}`,
          down: `${rc.r + 1},${rc.c}`,
          left: `${rc.r},${rc.c - 1}`,
        };
        ctx.save();
        ctx.globalAlpha *= cageOpacity;
        ctx.strokeStyle = cageStroke;
        ctx.lineWidth = cageLineWidth;
        ctx.setLineDash(cageDash);
        if (!set.has(neighbors.up)) {
          ctx.beginPath();
          ctx.moveTo(x + inset, y + inset);
          ctx.lineTo(x + cellPx - inset, y + inset);
          ctx.stroke();
        }
        if (!set.has(neighbors.right)) {
          ctx.beginPath();
          ctx.moveTo(x + cellPx - inset, y + inset);
          ctx.lineTo(x + cellPx - inset, y + cellPx - inset);
          ctx.stroke();
        }
        if (!set.has(neighbors.down)) {
          ctx.beginPath();
          ctx.moveTo(x + inset, y + cellPx - inset);
          ctx.lineTo(x + cellPx - inset, y + cellPx - inset);
          ctx.stroke();
        }
        if (!set.has(neighbors.left)) {
          ctx.beginPath();
          ctx.moveTo(x + inset, y + inset);
          ctx.lineTo(x + inset, y + cellPx - inset);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (!cage.sum) return;
      const first = cage.cells[0];
      if (hasMatchingCornerLabel(cage.cells, cage.sum)) return;
      ctx.fillStyle = cage.textColor ?? cage.color ?? "#111111";
      ctx.font = `${scaledCosmeticPx(12, { previewMin: 4.5, normalMin: 8, max: 14 })}px ${gridTextFont}, ${emojiTextFont}`;
      ctx.fillText(
        cage.sum,
        cellX(first.c) + scaledCellPx(0.11, { previewMin: 1.2, normalMin: 4, max: 6 }),
        cellY(first.r) + scaledCellPx(0.24, { previewMin: 4.2, normalMin: 12, max: 14 }),
      );
    };

    const drawArrow = (a: NonNullable<PuzzleDefinition["cosmetics"]["arrows"]>[number]) => {
      const stroke = a.color ?? "#59606b";
      const lineW = scaledCosmeticPx(a.thickness ?? 4.2, { previewMin: 0.8, normalMin: 1.5 });
      const bulbRadius = scaledCellPx(0.18, { previewMin: 1.8, normalMin: 5, max: cellPx * 0.28 });
      const bulbStrokeWidth = scaledCosmeticPx(a.bulbStrokeThickness ?? 1.6, { previewMin: 0.5, normalMin: 0.9 });
      const waypointPath = Array.isArray(a.wayPoints) && a.wayPoints.length >= 2
        ? a.wayPoints
        : null;
      const pathPoints = waypointPath
        ? waypointPath.map((p) => ({ x: worldX(p.x), y: worldY(p.y) }))
        : (Array.isArray(a.path) ? a.path : []).map((rc) => ({ x: cellX(rc.c) + cellPx / 2, y: cellY(rc.r) + cellPx / 2 }));

      if (!waypointPath && pathPoints.length > 1 && a.bulb) {
        const first = pathPoints[0] as { x: number; y: number };
        const second = pathPoints[1] as { x: number; y: number };
        const vx = second.x - first.x;
        const vy = second.y - first.y;
        const vl = Math.hypot(vx, vy) || 1;
        pathPoints[0] = {
          x: first.x + (vx / vl) * bulbRadius * 0.92,
          y: first.y + (vy / vl) * bulbRadius * 0.92,
        };
      }

      if (pathPoints.length >= 2) {
        const end = pathPoints[pathPoints.length - 1] as { x: number; y: number };
        const prev = pathPoints[pathPoints.length - 2] as { x: number; y: number };
        const ex = end.x;
        const ey = end.y;
        const px = prev.x;
        const py = prev.y;
        const vx = ex - px;
        const vy = ey - py;
        const vl = Math.hypot(vx, vy) || 1;
        const ux = vx / vl;
        const uy = vy / vl;
        const nx = -uy;
        const ny = ux;
        const headStyle = a.headStyle === "fill" ? "fill" : "stroke";
        const headAngleDeg = Number.isFinite(a.headAngle) ? Number(a.headAngle) : 90;
        const halfRad = (headAngleDeg * Math.PI) / 360;
        const headIndent = Number.isFinite(a.headIndent) ? Math.max(0, Number(a.headIndent)) : 0;
        const headSide = Number.isFinite(a.headLength)
          ? scaledCellPx(Number(a.headLength), { previewMin: 0, normalMin: 0 })
          : lineW * 5;
        const headBack = headSide * Math.cos(halfRad);
        const headSpread = headSide * Math.sin(halfRad);
        const retractBy = headStyle === "fill"
          ? Math.max(0, headBack * Math.max(0, 1 - headIndent) - 0.5)
          : lineW;
        const retract = Math.min(retractBy, Math.max(0, vl - 0.001));

        const shaftPoints = [...pathPoints];
        shaftPoints[shaftPoints.length - 1] = {
          x: ex - ux * retract,
          y: ey - uy * retract,
        };

        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineW;
        ctx.lineCap = "butt";
        ctx.lineJoin = "round";
        ctx.beginPath();
        shaftPoints.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();

        const leftX = ex - ux * headBack + nx * headSpread;
        const leftY = ey - uy * headBack + ny * headSpread;
        const rightX = ex - ux * headBack - nx * headSpread;
        const rightY = ey - uy * headBack - ny * headSpread;

        if (headStyle === "fill") {
          const notchBack = headBack * Math.max(0, 1 - headIndent);
          const notchX = ex - ux * notchBack;
          const notchY = ey - uy * notchBack;
          ctx.fillStyle = stroke;
          ctx.beginPath();
          ctx.moveTo(leftX, leftY);
          ctx.lineTo(ex, ey);
          ctx.lineTo(rightX, rightY);
          ctx.lineTo(notchX, notchY);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = lineW;
          ctx.lineCap = "butt";
          ctx.lineJoin = "miter";
          ctx.beginPath();
          ctx.moveTo(leftX, leftY);
          ctx.lineTo(ex, ey);
          ctx.lineTo(rightX, rightY);
          ctx.stroke();
        }
      }

      if (!a.bulb) return;
      const b = a.bulb;
      ctx.fillStyle = a.bulbFill ?? "#ffffff";
      ctx.beginPath();
      ctx.arc(cellX(b.c) + cellPx / 2, cellY(b.r) + cellPx / 2, bulbRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = a.bulbStroke ?? "#222222";
      ctx.lineWidth = bulbStrokeWidth;
      ctx.stroke();
    };

    const drawDot = (d: NonNullable<PuzzleDefinition["cosmetics"]["dots"]>[number]) => {
      if (!inBounds(d.a.r, d.a.c) || !inBounds(d.b.r, d.b.c)) return;
      const ax = cellX(d.a.c) + cellPx / 2;
      const ay = cellY(d.a.r) + cellPx / 2;
      const bx = cellX(d.b.c) + cellPx / 2;
      const by = cellY(d.b.r) + cellPx / 2;
      const x = (ax + bx) / 2;
      const y = (ay + by) / 2;
      const dotRadius = Number.isFinite(d.radius)
        ? scaledCosmeticPx(Number(d.radius), { previewMin: 1.5, normalMin: 3.5 })
        : scaledCellPx(0.125, { previewMin: 1.5, normalMin: 3.5 });
      const dotOpacity = Number.isFinite(d.opacity) ? Math.max(0, Math.min(1, Number(d.opacity))) : 1;
      const fillColor = d.color ?? (d.kind === "white" ? "#ffffff" : "#1b1b1b");
      const borderColor = d.borderColor ?? "#111111";
      const explicitBorderThickness = Number.isFinite(d.borderThickness)
        ? Number(d.borderThickness)
        : undefined;
      const borderWidth = explicitBorderThickness != null
        ? scaledCosmeticPx(explicitBorderThickness, { previewMin: 0, normalMin: 0 })
        : scaledCosmeticPx(2, { previewMin: 0.5, normalMin: 1 });
      ctx.save();
      ctx.globalAlpha *= dotOpacity;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      if (borderWidth > 0) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.stroke();
      }
      ctx.restore();
    };

    type VisualLayerEntry =
      | { kind: "line"; item: NonNullable<PuzzleDefinition["cosmetics"]["lines"]>[number]; order: number; serial: number }
      | { kind: "cage"; item: NonNullable<PuzzleDefinition["cosmetics"]["cages"]>[number]; order: number; serial: number }
      | { kind: "arrow"; item: NonNullable<PuzzleDefinition["cosmetics"]["arrows"]>[number]; order: number; serial: number }
      | { kind: "dot"; item: NonNullable<PuzzleDefinition["cosmetics"]["dots"]>[number]; order: number; serial: number }
      | { kind: "layer"; item: NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>[number]; order: number; serial: number };

    const collectVisualLayerEntries = (layer: VisualTargetLayer): VisualLayerEntry[] => {
      const entries: VisualLayerEntry[] = [];
      let serial = 0;
      const maxOrder = Number.MAX_SAFE_INTEGER;

      for (const ln of def.cosmetics.lines ?? []) {
        if (ln.wayPoints.length < 2) continue;
        if (classifyRenderTargetWithDefault(ln.target, "arrows") !== layer) continue;
        entries.push({ kind: "line", item: ln, order: ln.renderOrder ?? maxOrder, serial: serial++ });
      }

      for (const cage of def.cosmetics.cages ?? []) {
        if (classifyRenderTargetWithDefault(cage.target, "cages") !== layer) continue;
        entries.push({ kind: "cage", item: cage, order: cage.renderOrder ?? maxOrder, serial: serial++ });
      }

      for (const arrow of def.cosmetics.arrows ?? []) {
        if (classifyRenderTargetWithDefault(arrow.target, "arrows") !== layer) continue;
        entries.push({ kind: "arrow", item: arrow, order: arrow.renderOrder ?? maxOrder, serial: serial++ });
      }

      for (const dot of def.cosmetics.dots ?? []) {
        if (classifyRenderTargetWithDefault(dot.target, "over") !== layer) continue;
        entries.push({ kind: "dot", item: dot, order: dot.renderOrder ?? maxOrder, serial: serial++ });
      }

      for (const layerItem of def.cosmetics.underlays ?? []) {
        if (classifyRenderTargetWithDefault(layerItem.target, "under") !== layer) continue;
        entries.push({ kind: "layer", item: layerItem, order: layerItem.renderOrder ?? maxOrder, serial: serial++ });
      }

      for (const layerItem of def.cosmetics.overlays ?? []) {
        if (classifyRenderTargetWithDefault(layerItem.target, "over") !== layer) continue;
        entries.push({ kind: "layer", item: layerItem, order: layerItem.renderOrder ?? maxOrder, serial: serial++ });
      }

      entries.sort((a, b) => a.order - b.order || a.serial - b.serial);
      return entries;
    };

    const drawVisualLayer = (layer: VisualTargetLayer) => {
      for (const entry of collectVisualLayerEntries(layer)) {
        if (entry.kind === "line") drawConstraintLine(entry.item);
        else if (entry.kind === "cage") drawCage(entry.item);
        else if (entry.kind === "arrow") drawArrow(entry.item);
        else if (entry.kind === "dot") drawDot(entry.item);
        else drawLayerItem(entry.item);
      }
    };

    // Mirror SudokuPad's board SVG stack: underlay -> arrows -> cages -> highlights -> cell-grids -> overlay.
    drawVisualLayer("under");
    drawVisualLayer("arrows");
    drawVisualLayer("cages");

    // Highlights sit above arrows/cages and below the grid and overlays.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const colors = progress.cells[r][c].highlights ?? [];
        drawCellHighlights(r, c, colors);
      }
    }

    const drawGridPuzzleFeatures = () => {
      drawVisualLayer("grid");
    };

    const drawTopPuzzleFeatures = () => {
      drawVisualLayer("over");
    };

    const clipToFogVisibleAreas = (litMask: boolean[][]) => {
      const boardLeft = cellX(0);
      const boardTop = cellY(0);
      const boardRight = cellX(cols);
      const boardBottom = cellY(rows);

      ctx.beginPath();

      // Keep everything outside the board visible regardless of fog state.
      if (boardTop > 0) ctx.rect(0, 0, widthPx, boardTop);
      if (boardBottom < heightPx) ctx.rect(0, boardBottom, widthPx, heightPx - boardBottom);
      if (boardLeft > 0 && boardBottom > boardTop) {
        ctx.rect(0, boardTop, boardLeft, boardBottom - boardTop);
      }
      if (boardRight < widthPx && boardBottom > boardTop) {
        ctx.rect(boardRight, boardTop, widthPx - boardRight, boardBottom - boardTop);
      }

      // Inside the board, only lit cells are visible through fog.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!litMask[r][c]) continue;
          ctx.rect(cellX(c), cellY(r), cellPx, cellPx);
        }
      }

      ctx.clip();
    };

    const fogDefined =
      def.cosmetics.fogEnabled === true ||
      (def.cosmetics.fogLights?.length ?? 0) > 0 ||
      (def.cosmetics.fogTriggerEffects?.length ?? 0) > 0;

    // Keep a dedicated grid-target pass between highlights and the built-in grid.
    drawGridPuzzleFeatures();

    // Grid below top puzzle artwork so features are not bisected by grid lines.
    drawGridLines();
    if (!fogDefined) drawTopPuzzleFeatures();

    const drawCenterStroke = (segments: LineSegmentDraft[], color: string, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = scaledCellPx(0.071, { previewMin: 0.8, normalMin: 2.4 });
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const seg of segments) {
        const ax = cellX(seg.a.c) + cellPx / 2;
        const ay = cellY(seg.a.r) + cellPx / 2;
        const bx = cellX(seg.b.c) + cellPx / 2;
        const by = cellY(seg.b.r) + cellPx / 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawEdgeStroke = (segments: LineSegmentDraft[], color: string, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = scaledCellPx(0.068, { previewMin: 0.75, normalMin: 2.2 });
      ctx.lineCap = "round";
      for (const seg of segments) {
        const dr = Math.abs(seg.b.r - seg.a.r);
        const dc = Math.abs(seg.b.c - seg.a.c);
        if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) continue;
        const x0 = cellX(seg.a.c);
        const y0 = cellY(seg.a.r);
        const x1 = cellX(seg.b.c);
        const y1 = cellY(seg.b.r);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawUserLines = () => {
      const previewKeys = linePreview?.segments?.length
        ? new Set(linePreview.segments.map((seg) => segKeyWithKind(seg, linePreview.kind)))
        : null;
      const erasePreview = Boolean(
        previewKeys &&
          progress.lines.some((stroke) =>
            lineKindNamespace(stroke.kind) === linePreview?.kind &&
            stroke.segments.some((seg) => previewKeys.has(segKeyWithKind(seg, stroke.kind)))
          )
      );

      for (const stroke of progress.lines) {
        const segments = erasePreview && previewKeys
          ? (lineKindNamespace(stroke.kind) === linePreview?.kind
            ? stroke.segments.filter((seg) => !previewKeys.has(segKeyWithKind(seg, stroke.kind)))
            : stroke.segments)
          : stroke.segments;
        if (!segments.length) continue;
        if (stroke.kind === "edge") drawEdgeStroke(segments, stroke.color);
        else drawCenterStroke(segments, stroke.color);
      }

      // When overlap is detected, preview as progressive erase by hiding matching segments.
      if (linePreview && !erasePreview) {
        if (linePreview.kind === "edge") drawEdgeStroke(linePreview.segments, progress.linePaletteColor, 0.8);
        else drawCenterStroke(linePreview.segments, progress.linePaletteColor, 0.8);
      }

      for (const mark of progress.lineCenterMarks) {
        const x = cellX(mark.rc.c) + cellPx / 2;
        const y = cellY(mark.rc.r) + cellPx / 2;
        ctx.strokeStyle = mark.color;
        ctx.lineWidth = scaledCellPx(0.054, { previewMin: 0.6, normalMin: 1.8 });
        if (mark.kind === "circle") {
          ctx.beginPath();
          ctx.arc(x, y, scaledCellPx(0.18, { previewMin: 1.6, normalMin: 4.5 }), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const r = scaledCellPx(0.18, { previewMin: 1.6, normalMin: 4.5 });
          ctx.beginPath();
          ctx.moveTo(x - r, y - r);
          ctx.lineTo(x + r, y + r);
          ctx.moveTo(x + r, y - r);
          ctx.lineTo(x - r, y + r);
          ctx.stroke();
        }
      }

      for (const mark of progress.lineEdgeMarks) {
        const dr = mark.b.r - mark.a.r;
        const dc = mark.b.c - mark.a.c;
        if (Math.abs(dr) + Math.abs(dc) !== 1) continue;
        const aInCellBounds = inBounds(mark.a.r, mark.a.c);
        const bInCellBounds = inBounds(mark.b.r, mark.b.c);
        const useCellCenters = aInCellBounds && bInCellBounds;
        const x = useCellCenters
          ? (cellX(mark.a.c) + cellPx / 2 + (cellX(mark.b.c) + cellPx / 2)) / 2
          : (cellX(mark.a.c) + cellX(mark.b.c)) / 2;
        const y = useCellCenters
          ? (cellY(mark.a.r) + cellPx / 2 + (cellY(mark.b.r) + cellPx / 2)) / 2
          : (cellY(mark.a.r) + cellY(mark.b.r)) / 2;
        ctx.strokeStyle = mark.color;
        ctx.lineWidth = scaledCellPx(0.046, { previewMin: 0.55, normalMin: 1.4 });
        const r = scaledCellPx(0.11, { previewMin: 1, normalMin: 3 });
        ctx.beginPath();
        ctx.moveTo(x - r, y - r);
        ctx.lineTo(x + r, y + r);
        ctx.moveTo(x + r, y - r);
        ctx.lineTo(x - r, y + r);
        ctx.stroke();
      }
    };

    const lit = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
    const cageLabelCells = new Set<string>();
    for (const cage of def.cosmetics.cages ?? []) {
      if (!cage.sum || !cage.cells?.length) continue;
      const first = cage.cells[0] as CellRC;
      cageLabelCells.add(`${first.r},${first.c}`);
    }
    const valueFontPx = Math.max(previewMode ? 4.5 : 11, Math.min(previewMode ? 30 : 42, Math.round(cellPx * 0.58)));
    const noteFontPx = Math.max(previewMode ? 3 : 6, Math.min(previewMode ? 10 : 19, Math.round(cellPx * 0.26)));
    const candidateFontPx = Math.max(previewMode ? 2.2 : 5, Math.min(previewMode ? 8 : 12, Math.round(cellPx * 0.18)));
    const cornerInsetX = Math.max(previewMode ? 0.8 : 2, Math.round(cellPx * 0.08));
    const cornerBaseY = Math.max(previewMode ? 2.2 : 7, Math.round(cellPx * 0.22));
    const digitOutlineWidth = Math.max(previewMode ? 0.18 : 0.45, Math.min(previewMode ? 0.6 : 0.9, cellPx * 0.015));
    const drawDigitText = (text: string, x: number, y: number) => {
      if (outlineDigits) {
        ctx.save();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = digitOutlineWidth;
        ctx.lineJoin = "round";
        ctx.miterLimit = 2;
        ctx.strokeText(text, x, y);
        ctx.restore();
      }
      ctx.fillText(text, x, y);
    };
    const noteColor = "#1e2633";
    const conflictColor = "#d93025";
    const drawSymbolRun = (
      symbols: string[],
      x: number,
      y: number,
      opts: { align: "left" | "center"; isConflict: (symbol: string) => boolean; fontPxOverride?: number }
    ) => {
      const values = symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean) as string[];
      if (!values.length) return;

      const useFontPx = opts.fontPxOverride ?? noteFontPx;
      const widths = values.map((symbol) => Math.max(0.001, ctx.measureText(symbol).width));
      const spacing = Math.max(0.2, useFontPx * 0.05);
      const totalWidth =
        widths.reduce((sum, width) => sum + width, 0) +
        Math.max(0, values.length - 1) * spacing;
      let cursor = opts.align === "center" ? x - totalWidth / 2 : x;

      ctx.textAlign = "center";
      for (let i = 0; i < values.length; i++) {
        const symbol = values[i] as string;
        const width = widths[i] as number;
        ctx.fillStyle = opts.isConflict(symbol) ? conflictColor : noteColor;
        drawDigitText(symbol, cursor + width / 2, y);
        cursor += width + spacing;
      }
    };
    if (fogDefined) {
      const addLight = (rc: CellRC) => {
        if (!inBounds(rc.r, rc.c)) return;
        lit[rc.r][rc.c] = true;
      };
      const revealNeighborhood = (rc: CellRC) => {
        for (let rr = rc.r - 1; rr <= rc.r + 1; rr++) {
          for (let cc = rc.c - 1; cc <= rc.c + 1; cc++) addLight({ r: rr, c: cc });
        }
      };

      for (const rc of def.cosmetics.fogLights ?? []) addLight(rc);

      const solution = def.cosmetics.solution;
      const isCorrect = (rc: CellRC) => {
        if (!inBounds(rc.r, rc.c)) return false;
        const value = normalizeComparisonSymbol(progress.cells[rc.r][rc.c].value);
        if (!value) return false;
        if (solution && solution.length >= rows * cols) {
          const idx = rc.r * cols + rc.c;
          const expected = normalizeComparisonSymbol(solution[idx]);
          if (!expected || expected === ".") return false;
          return value === expected;
        }
        const given = normalizeComparisonSymbol(progress.cells[rc.r][rc.c].given);
        return Boolean(given && value === given);
      };

      const hasTriggerEffects = (def.cosmetics.fogTriggerEffects?.length ?? 0) > 0;
      if (hasTriggerEffects) {
        for (const effect of def.cosmetics.fogTriggerEffects ?? []) {
          const mode = effect.triggerMode;
          const satisfied = mode === "or"
            ? effect.triggerCells.some(isCorrect)
            : effect.triggerCells.every(isCorrect);
          if (!satisfied) continue;
          for (const rc of effect.revealCells) addLight(rc);
        }
      } else {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const rc = { r, c };
            if (!isCorrect(rc)) continue;
            if (progress.cells[r][c].given) addLight(rc);
            else revealNeighborhood(rc);
          }
        }
      }
    }

    if (!fogDefined) {
      // Keep lines/marks above highlights and puzzle art, but behind numbers/letters.
      drawUserLines();
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = progress.cells[r][c];
        const x0 = cellX(c);
        const y0 = cellY(r);

        const valueSymbol = normalizeSymbol(cell.value);
        if (valueSymbol) {
          ctx.fillStyle = hasBigValuePeer(r, c, valueSymbol)
            ? conflictColor
            : cell.given
              ? "#111111"
              : "#123f9a";
          ctx.font = cell.given ? `700 ${valueFontPx}px ${gridTextFont}, ${emojiTextFont}` : `650 ${valueFontPx}px ${gridTextFont}, ${emojiTextFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          drawDigitText(valueSymbol, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
        } else {
          ctx.font = `${noteFontPx}px ${gridTextFont}, ${emojiTextFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const corner = [...cell.notes.corner].sort();
          if (corner.length) {
            const hasCageLabel = cageLabelCells.has(`${r},${c}`);
            drawSymbolRun(corner, x0 + cornerInsetX, y0 + (hasCageLabel ? cornerBaseY * 2 : cornerBaseY), {
              align: "left",
              isConflict: (symbol) => hasBigValuePeer(r, c, symbol),
            });
          }

          const center = [...cell.notes.center].sort();
          if (center.length) {
            let centerFontPx = noteFontPx;
            ctx.font = `${centerFontPx}px ${gridTextFont}, ${emojiTextFont}`;
            const centerVals = center.map((s) => normalizeSymbol(s)).filter(Boolean) as string[];
            if (centerVals.length > 1) {
              const sp0 = Math.max(0.2, centerFontPx * 0.05);
              const totalW0 = centerVals.reduce((a, s) => a + Math.max(0.001, ctx.measureText(s).width), 0)
                + (centerVals.length - 1) * sp0;
              const maxW = cellPx * 0.9;
              if (totalW0 > maxW) {
                centerFontPx = Math.max(1, (centerFontPx * maxW) / totalW0);
                ctx.font = `${centerFontPx}px ${gridTextFont}, ${emojiTextFont}`;
              }
            }
            drawSymbolRun(center, x0 + cellPx / 2, y0 + cellPx / 2, {
              align: "center",
              isConflict: (symbol) => hasBigValuePeer(r, c, symbol),
              fontPxOverride: centerFontPx,
            });
          }

          const cand = new Set(cell.notes.candidates);
          if (cand.size) {
            ctx.font = `${candidateFontPx}px ${gridTextFont}, ${emojiTextFont}`;
            ctx.textAlign = "center";
            const sym = Array.from(cand).sort();
            for (const rawSymbol of sym) {
              const symbol = normalizeSymbol(rawSymbol);
              if (!symbol) continue;
              const idx = Number.isFinite(Number(symbol)) ? Number(symbol) : symbol.charCodeAt(0) - 64;
              if (!idx) continue;
              const rr = Math.floor((idx - 1) / 3);
              const cc = (idx - 1) % 3;
              ctx.fillStyle = hasBigValuePeer(r, c, symbol) ? conflictColor : noteColor;
              ctx.fillText(symbol, x0 + (cc + 0.5) * (cellPx / 3), y0 + (rr + 0.5) * (cellPx / 3));
            }
          }
        }

      }
    }

    if (fogDefined) {
      ctx.fillStyle = "#afafaf";
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (lit[r][c]) continue;
          ctx.fillRect(cellX(c), cellY(r), cellPx, cellPx);
        }
      }

      // Keep user highlights visible under fog, slightly darkened.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const colors = progress.cells[r][c].highlights ?? [];
          if (!colors.length) continue;
          const display = lit[r][c] ? colors : colors.map((col) => darkenColor(col, 0.3));
          drawCellHighlights(r, c, display, highlightAlpha);
        }
      }

      // Grid-target features (for example cell-grids monitors) stay visible above fog.
      drawGridPuzzleFeatures();

      if (def.cosmetics.gridVisible !== false) {
        drawGridLines();
      }

      // Keep top puzzle feature layers above the grid under fog.
      // Within the board, show them only in lit cells; outside the board, keep them visible.
      ctx.save();
      clipToFogVisibleAreas(lit);
      drawTopPuzzleFeatures();
      ctx.restore();

      // Keep lines/marks above highlights under fog, but behind values/letters.
      drawUserLines();

      // Keep user-entered values visible under fog; hide unrevealed givens.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = progress.cells[r][c];
          const x0 = cellX(c);
          const y0 = cellY(r);

          const valueSymbol = normalizeSymbol(cell.value);
          if (valueSymbol) {
            if (cell.given && !lit[r][c]) continue;
            ctx.fillStyle = hasBigValuePeer(r, c, valueSymbol)
              ? conflictColor
              : cell.given
                ? "#111111"
                : "#123f9a";
            ctx.font = cell.given ? `700 ${valueFontPx}px ${gridTextFont}, ${emojiTextFont}` : `650 ${valueFontPx}px ${gridTextFont}, ${emojiTextFont}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            drawDigitText(valueSymbol, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
            continue;
          }

          if (cell.given) continue;
          ctx.font = `${noteFontPx}px ${gridTextFont}, ${emojiTextFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const corner = [...cell.notes.corner].sort();
          if (corner.length) {
            drawSymbolRun(corner, x0 + cornerInsetX, y0 + cornerBaseY, {
              align: "left",
              isConflict: (symbol) => hasBigValuePeer(r, c, symbol),
            });
          }

          const center = [...cell.notes.center].sort();
          if (center.length) {
            let centerFontPx = noteFontPx;
            ctx.font = `${centerFontPx}px ${gridTextFont}, ${emojiTextFont}`;
            const centerVals = center.map((s) => normalizeSymbol(s)).filter(Boolean) as string[];
            if (centerVals.length > 1) {
              const sp0 = Math.max(0.2, centerFontPx * 0.05);
              const totalW0 = centerVals.reduce((a, s) => a + Math.max(0.001, ctx.measureText(s).width), 0)
                + (centerVals.length - 1) * sp0;
              const maxW = cellPx * 0.9;
              if (totalW0 > maxW) {
                centerFontPx = Math.max(1, (centerFontPx * maxW) / totalW0);
                ctx.font = `${centerFontPx}px ${gridTextFont}, ${emojiTextFont}`;
              }
            }
            drawSymbolRun(center, x0 + cellPx / 2, y0 + cellPx / 2, {
              align: "center",
              isConflict: (symbol) => hasBigValuePeer(r, c, symbol),
              fontPxOverride: centerFontPx,
            });
          }
        }
      }
    }

    drawSelectionOutlines();
  }, [
    bgImage,
    boardH,
    boardW,
    cellPx,
    def,
    emojiRenderVersion,
    getTwemojiImage,
    heightPx,
    highlightRotationRad,
    linePreview,
    outlineDigits,
    conflictChecker,
    cols,
    originX,
    originY,
    pad,
    previewMode,
    progress,
    rows,
    cellX,
    cellY,
    cosmeticUnit,
    emojiTextFont,
    inBounds,
    worldX,
    worldY,
    widthPx,
  ]);

  function clientToCanvasLocal(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return mapForcedPortraitPoint(
      readForcedPortraitDirection(),
      canvas.clientWidth,
      canvas.clientHeight,
      clientX - rect.left,
      clientY - rect.top,
    );
  }

  function eventPoint(clientX: number, clientY: number) {
    const local = clientToCanvasLocal(clientX, clientY);
    if (!local) return null;
    const bx = local.x - originX;
    const by = local.y - originY;
    const c = Math.floor(bx / cellPx);
    const r = Math.floor(by / cellPx);
    if (!inBounds(r, c)) return null;
    const fx = bx / cellPx - c;
    const fy = by / cellPx - r;
    return { r, c, fx, fy };
  }

  function eventGridPoint(clientX: number, clientY: number) {
    const local = clientToCanvasLocal(clientX, clientY);
    if (!local) return null;
    const gx = (local.x - originX) / cellPx;
    const gy = (local.y - originY) / cellPx;
    return { gx, gy };
  }

  function nearestCellCenter(clientX: number, clientY: number): CellRC | null {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return null;
    const c = Math.round(gp.gx - 0.5);
    const r = Math.round(gp.gy - 0.5);
    if (!inBounds(r, c)) return null;
    return { r, c };
  }

  function centerHopsFromPointer(
    last: CellRC,
    clientX: number,
    clientY: number,
    opts?: { diagonalAssistThreshold?: number; diagonalAssistMinRatio?: number }
  ): CellRC[] {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return [];

    const target = { x: gp.gx - 0.5, y: gp.gy - 0.5 };
    const diagonalAssistThreshold = Math.max(0, Math.min(0.49, opts?.diagonalAssistThreshold ?? 0.22));
    const diagonalAssistMinRatio = Math.max(0, Math.min(1, opts?.diagonalAssistMinRatio ?? 0));
    const hops: CellRC[] = [];
    let cur = { ...last };

    for (let i = 0; i < 10; i++) {
      const dx = target.x - cur.c;
      const dy = target.y - cur.r;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const primaryDelta = Math.max(absDx, absDy);
      const secondaryDelta = Math.min(absDx, absDy);
      const stepCX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      const stepRY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      let stepC = absDx >= 0.5 ? stepCX : 0;
      let stepR = absDy >= 0.5 ? stepRY : 0;
      const diagonalIntent =
        secondaryDelta >= diagonalAssistThreshold &&
        (primaryDelta <= 1e-9 || (secondaryDelta / primaryDelta) >= diagonalAssistMinRatio);

      // Widen diagonal routing corridor so near-corner drags prefer diagonal hops.
      if (!stepC && stepR && stepCX && diagonalIntent) stepC = stepCX;
      if (!stepR && stepC && stepRY && diagonalIntent) stepR = stepRY;

      if (!stepR && !stepC) break;

      const next = { r: cur.r + stepR, c: cur.c + stepC };
      if (!inBounds(next.r, next.c)) break;
      if (next.r === cur.r && next.c === cur.c) break;
      hops.push(next);
      cur = next;
    }

    return hops;
  }

  function centerLineHopsFromPointer(
    last: CellRC,
    fromClientX: number,
    fromClientY: number,
    toClientX: number,
    toClientY: number,
    opts?: { hotZoneRadius?: number; samplesPerCell?: number; maxHops?: number }
  ): CellRC[] {
    const start = eventGridPoint(fromClientX, fromClientY) ?? eventGridPoint(toClientX, toClientY);
    const end = eventGridPoint(toClientX, toClientY);
    if (!start || !end) return [];

    const hotZoneRadius = Math.max(0.2, Math.min(LINE_NODE_RADIUS, opts?.hotZoneRadius ?? LINE_NODE_RADIUS));
    const samplesPerCell = Math.max(8, Math.min(40, opts?.samplesPerCell ?? 24));
    const maxHops = Math.max(1, Math.min(20, opts?.maxHops ?? 12));

    const dx = end.gx - start.gx;
    const dy = end.gy - start.gy;
    const samples = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * samplesPerCell));

    const hops: CellRC[] = [];
    let cur = { ...last };

    for (let i = 1; i <= samples && hops.length < maxHops; i++) {
      const t = i / samples;
      const px = start.gx + dx * t;
      const py = start.gy + dy * t;

      let best: CellRC | null = null;
      let bestDist = Number.POSITIVE_INFINITY;

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          if (!inBounds(nr, nc)) continue;
          const cx = nc + 0.5;
          const cy = nr + 0.5;
          const dist = Math.hypot(px - cx, py - cy);
          if (dist <= hotZoneRadius && dist < bestDist) {
            bestDist = dist;
            best = { r: nr, c: nc };
          }
        }
      }

      if (!best) continue;
      if (best.r === cur.r && best.c === cur.c) continue;
      hops.push(best);
      cur = best;
    }

    return hops;
  }

  function edgeLineHopsFromPointer(
    last: CellRC,
    fromClientX: number,
    fromClientY: number,
    toClientX: number,
    toClientY: number,
    opts?: { samplesPerCell?: number; maxHops?: number }
  ): CellRC[] {
    const start = eventGridPoint(fromClientX, fromClientY) ?? eventGridPoint(toClientX, toClientY);
    const end = eventGridPoint(toClientX, toClientY);
    if (!start || !end) return [];

    const hotZoneRadius = LINE_NODE_RADIUS;
    const samplesPerCell = Math.max(8, Math.min(40, opts?.samplesPerCell ?? 24));
    const maxHops = Math.max(1, Math.min(20, opts?.maxHops ?? 12));

    const dx = end.gx - start.gx;
    const dy = end.gy - start.gy;
    const samples = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * samplesPerCell));

    const inCornerBounds = (r: number, c: number) => r >= 0 && c >= 0 && r <= rows && c <= cols;
    const hops: CellRC[] = [];
    let cur = { ...last };

    for (let i = 1; i <= samples && hops.length < maxHops; i++) {
      const t = i / samples;
      const px = start.gx + dx * t;
      const py = start.gy + dy * t;

      let best: CellRC | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      const candidates = [
        { r: cur.r - 1, c: cur.c },
        { r: cur.r + 1, c: cur.c },
        { r: cur.r, c: cur.c - 1 },
        { r: cur.r, c: cur.c + 1 },
        { r: cur.r - 1, c: cur.c - 1 },
        { r: cur.r - 1, c: cur.c + 1 },
        { r: cur.r + 1, c: cur.c - 1 },
        { r: cur.r + 1, c: cur.c + 1 },
      ];

      for (const cand of candidates) {
        if (!inCornerBounds(cand.r, cand.c)) continue;
        const dist = Math.hypot(px - cand.c, py - cand.r);
        if (dist <= hotZoneRadius && dist < bestDist) {
          bestDist = dist;
          best = { r: cand.r, c: cand.c };
        }
      }

      if (!best) continue;
      if (best.r === cur.r && best.c === cur.c) continue;
      hops.push(best);
      cur = best;
    }

    return hops;
  }

  function nearestCornerNodeCircle(clientX: number, clientY: number): CellRC | null {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return null;
    const c = Math.round(gp.gx);
    const r = Math.round(gp.gy);
    if (r < 0 || c < 0 || r > rows || c > cols) return null;
    if (Math.hypot(gp.gx - c, gp.gy - r) > LINE_NODE_RADIUS) return null;
    return { r, c };
  }

  function nearestCornerNodeLoose(clientX: number, clientY: number): CellRC | null {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return null;
    const c = Math.max(0, Math.min(cols, Math.round(gp.gx)));
    const r = Math.max(0, Math.min(rows, Math.round(gp.gy)));
    return { r, c };
  }

  function pickEdgeByPointer(clientX: number, clientY: number, threshold = 0.44): { a: CellRC; b: CellRC } | null {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return null;

    let best: { a: CellRC; b: CellRC } | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    // Vertical internal borders between adjacent left/right cells.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const cx = c + 1;
        const cy = r + 0.5;
        const dist = Math.hypot(gp.gx - cx, gp.gy - cy);
        if (dist < bestDist) {
          bestDist = dist;
          best = { a: { r, c }, b: { r, c: c + 1 } };
        }
      }
    }

    // Horizontal internal borders between adjacent top/bottom cells.
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = c + 0.5;
        const cy = r + 1;
        const dist = Math.hypot(gp.gx - cx, gp.gy - cy);
        if (dist < bestDist) {
          bestDist = dist;
          best = { a: { r, c }, b: { r: r + 1, c } };
        }
      }
    }

    if (!best || bestDist > threshold) return null;
    return best;
  }

  function resolveInitialLineKind(point: { fx: number; fy: number }): LineKindResolved {
    if (progress.linePaletteKind === "center") return "center";
    if (progress.linePaletteKind === "edge") return "edge";

    const dCenter = Math.hypot(point.fx - 0.5, point.fy - 0.5);
    const dEdgeCenter = Math.min(
      Math.hypot(point.fx - 0.5, point.fy),
      Math.hypot(point.fx - 0.5, 1 - point.fy),
      Math.hypot(point.fx, point.fy - 0.5),
      Math.hypot(1 - point.fx, point.fy - 0.5),
    );
    const dCorner = Math.min(
      Math.hypot(point.fx, point.fy),
      Math.hypot(1 - point.fx, point.fy),
      Math.hypot(point.fx, 1 - point.fy),
      Math.hypot(1 - point.fx, 1 - point.fy),
    );

    // In both-mode, keep a strong center zone to avoid accidental edge taps.
    if (dCenter <= 0.27) return "center";
    // Near the middle of an edge should favor edge marks.
    if (dEdgeCenter <= 0.19) return "edge";
    // Very near corners still favors edge intent.
    if (dCorner <= 0.14) return "edge";

    return dCenter <= dEdgeCenter ? "center" : "edge";
  }

  function onDown(e: React.PointerEvent) {
    if (!interactive) return;
    const pt = eventPoint(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rc = { r: pt.r, c: pt.c };
    if (progress.activeTool === "line") {
      const kind = resolveInitialLineKind(pt);
      const edgeTapCandidate = kind === "edge" ? pickEdgeByPointer(e.clientX, e.clientY, 0.47) ?? undefined : undefined;
      const start = kind === "edge"
        ? nearestCornerNodeCircle(e.clientX, e.clientY) ?? nearestCornerNodeLoose(e.clientX, e.clientY)
        : nearestCellCenter(e.clientX, e.clientY) ?? rc;
      if (!start) return;
      dragRef.current = {
        path: [start],
        segments: [],
        last: start,
        moved: false,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        edgeTapCandidate,
        lineKind: kind,
        visited: new Set([rcKey(start)]),
      };
      setLinePreview({ segments: [], kind });
      return;
    }

    const currentSelection = new Set(progress.selection.map(rcKey));
    const key = rcKey(rc);
    const touchedSelected = currentSelection.has(key);

    if (!progress.multiSelect) {
      const nextSelection = new Set<string>();
      nextSelection.add(key);
      dragRef.current = {
        path: [rc],
        segments: [],
        last: rc,
        moved: false,
        visited: new Set([key]),
        selectionSet: nextSelection,
        selectionMode: "replace",
        startedSelected: touchedSelected,
        startedCellKey: key,
        startedSelectionSize: currentSelection.size,
        startClientX: e.clientX,
        startClientY: e.clientY,
        selectionDragActive: false,
      };
      props.onSelection(Array.from(nextSelection).map(keyToRc));
      return;
    }

    const nextSelection = new Set(currentSelection);
    const mode: DragState["selectionMode"] = touchedSelected ? "remove" : "add";
    if (mode === "remove") nextSelection.delete(key);
    else nextSelection.add(key);

    dragRef.current = {
      path: [rc],
      segments: [],
      last: rc,
      moved: false,
      visited: new Set([key]),
      selectionSet: nextSelection,
      selectionMode: mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      selectionDragActive: false,
    };
    props.onSelection(Array.from(nextSelection).map(keyToRc));
  }

  function onMove(e: React.PointerEvent) {
    if (!interactive) return;
    const drag = dragRef.current;
    if (!drag) return;

    if (progress.activeTool === "line") {
      const kind = drag.lineKind ?? "center";
      const prevCell = drag.path[drag.path.length - 2] ?? null;
      const hops = kind === "edge"
        ? edgeLineHopsFromPointer(
            drag.last,
            drag.lastClientX ?? e.clientX,
            drag.lastClientY ?? e.clientY,
            e.clientX,
            e.clientY,
            { samplesPerCell: 24, maxHops: 12 }
          )
        : centerLineHopsFromPointer(
            drag.last,
            drag.lastClientX ?? e.clientX,
            drag.lastClientY ?? e.clientY,
            e.clientX,
            e.clientY,
            { hotZoneRadius: LINE_NODE_RADIUS, samplesPerCell: 24, maxHops: 12 }
          );
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
      if (!hops.length) return;

      for (const hop of hops) {
        const dr = hop.r - drag.last.r;
        const dc = hop.c - drag.last.c;
        if (Math.abs(dr) > 1 || Math.abs(dc) > 1) continue;

        const previous = drag.path[drag.path.length - 2] ?? prevCell;
        const stepKey = segKey(drag.last, hop);
        if (previous && previous.r === hop.r && previous.c === hop.c) {
          const lastSeg = drag.segments[drag.segments.length - 1];
          if (lastSeg && segKey(lastSeg.a, lastSeg.b) === stepKey) drag.segments.pop();
          drag.path.pop();
          drag.last = hop;
          drag.moved = true;
          continue;
        }

        const occupied = kind === "edge" ? edgeLineKeys.has(stepKey) : centerLineKeys.has(stepKey);
        if (!drag.lineAction) drag.lineAction = occupied ? "erase" : "draw";

        if ((drag.lineAction === "erase" && occupied) || (drag.lineAction === "draw" && !occupied)) {
          drag.segments.push({ a: drag.last, b: hop });
        }

        drag.path.push(hop);
        drag.last = hop;
        drag.moved = true;
      }

      setLinePreview({ segments: [...drag.segments], kind });
      return;
    }

    const pt = eventPoint(e.clientX, e.clientY);
    if (!pt) return;

    if (!drag.selectionDragActive) {
      const dx = e.clientX - (drag.startClientX ?? e.clientX);
      const dy = e.clientY - (drag.startClientY ?? e.clientY);
      const activationPx = Math.max(6, Math.round(cellPx * 0.14));
      if (Math.hypot(dx, dy) < activationPx) return;
      drag.selectionDragActive = true;
    }

    const hops = centerHopsFromPointer(drag.last, e.clientX, e.clientY, { diagonalAssistThreshold: 0.26 });
    if (!hops.length) return;

    const nextSelection = drag.selectionSet ? new Set(drag.selectionSet) : new Set<string>();
    for (const hop of hops) {
      drag.last = hop;
      drag.moved = true;
      const hopKey = rcKey(hop);
      if (drag.visited.has(hopKey)) continue;
      drag.visited.add(hopKey);
      drag.path.push(hop);
      if (drag.selectionMode === "remove") nextSelection.delete(hopKey);
      else nextSelection.add(hopKey);
    }
    drag.selectionSet = nextSelection;
    props.onSelection(Array.from(nextSelection).map(keyToRc));
  }

  function onUp(e: React.PointerEvent) {
    if (!interactive) return;
    const drag = dragRef.current;
    if (!drag) return;

    if (progress.activeTool === "line") {
      const kind = drag.lineKind ?? "center";
      if (!drag.moved) {
        const tappedEdge = drag.edgeTapCandidate ?? pickEdgeByPointer(e.clientX, e.clientY, kind === "edge" ? 0.54 : 0.47);
        if (kind === "edge") {
          if (tappedEdge) {
            props.onLineTapEdge(tappedEdge.a, tappedEdge.b);
          }
        } else {
          const pt = eventPoint(e.clientX, e.clientY);
          if (pt) {
            const here = { r: pt.r, c: pt.c };
            props.onLineTapCell(here);
          }
        }
      } else if (drag.segments.length > 0 && drag.lineAction) {
        props.onLineStroke(drag.segments, kind, drag.lineAction);
      }
      setLinePreview(null);
    } else if (!progress.multiSelect && !drag.moved && drag.startedSelected && drag.startedSelectionSize === 1) {
      const pt = eventPoint(e.clientX, e.clientY);
      if (pt && drag.startedCellKey === `${pt.r},${pt.c}`) {
        props.onSelection([]);
      }
    }

    dragRef.current = null;
  }

  function onCancel() {
    if (!interactive) return;
    dragRef.current = null;
    setLinePreview(null);
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!interactive) return;
    const pt = eventPoint(e.clientX, e.clientY);
    if (!pt) return;
    props.onDoubleCell({ r: pt.r, c: pt.c });
  }

  return (
    <div ref={wrapRef} className="boardSurface" style={{ display: "grid", placeItems: "center", maxWidth: "100%", maxHeight: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          margin: "0 auto",
          maxWidth: "100%",
          maxHeight: "100%",
          touchAction: interactive ? "none" : "auto",
          userSelect: "none",
          pointerEvents: interactive ? "auto" : "none",
        }}
        onPointerDown={interactive ? onDown : undefined}
        onPointerMove={interactive ? onMove : undefined}
        onPointerUp={interactive ? onUp : undefined}
        onPointerCancel={interactive ? onCancel : undefined}
        onPointerLeave={interactive ? onCancel : undefined}
        onDoubleClick={interactive ? onDoubleClick : undefined}
      />
    </div>
  );
}
