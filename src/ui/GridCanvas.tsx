import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellRC, PuzzleDefinition, PuzzleProgress } from "../core/model";

type LineKindResolved = "center" | "edge";
type LineKindStored = LineKindResolved | "both";
type EdgeTrack = "top" | "bottom" | "left" | "right";
type LineSegmentDraft = { a: CellRC; b: CellRC; edgeTrack?: EdgeTrack };
type LayerItem = NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>[number];

type DragState = {
  path: CellRC[];
  segments: LineSegmentDraft[];
  last: CellRC;
  moved: boolean;
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

function defaultSubgridForSize(n: number): { r: number; c: number } {
  if (n === 6) return { r: 2, c: 3 };
  if (n === 8) return { r: 2, c: 4 };
  if (n === 10) return { r: 2, c: 5 };
  if (n === 12) return { r: 3, c: 4 };
  const s = Math.sqrt(n);
  if (Number.isInteger(s)) return { r: s, c: s };
  return { r: 1, c: 1 };
}

export function GridCanvas(props: {
  def: PuzzleDefinition;
  progress: PuzzleProgress;
  onSelection: (sel: CellRC[]) => void;
  onLineStroke: (segments: LineSegmentDraft[], kind: LineKindResolved, action: "draw" | "erase") => void;
  onLineTapCell: (rc: CellRC) => void;
  onLineTapEdge: (a: CellRC, b: CellRC) => void;
  onDoubleCell: (rc: CellRC) => void;
}) {
  const { def, progress } = props;
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
  const [mobileViewport, setMobileViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1000px)").matches;
  });

  const basePad = Math.max(14, Math.round(cellPx * 0.32));
  const pad = mobileViewport ? Math.max(3, Math.round(basePad * 0.2)) : basePad;
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

  const twemojiCodepoint = useCallback((text: string): string | null => {
    const value = text.trim();
    if (!value) return null;
    const cps: number[] = [];
    for (const ch of Array.from(value)) {
      const cp = ch.codePointAt(0);
      if (cp == null) continue;
      // Match Twemoji lookup behavior for most glyphs.
      if (cp === 0xfe0f) continue;
      cps.push(cp);
    }
    if (!cps.length) return null;
    return cps.map((cp) => cp.toString(16)).join("-");
  }, []);

  const twemojiUrl = useCallback((text: string): string | null => {
    const code = twemojiCodepoint(text);
    if (!code) return null;
    return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${code}.svg`;
  }, [twemojiCodepoint]);

  const getTwemojiImage = useCallback((text: string): HTMLImageElement | null => {
    const key = twemojiCodepoint(text);
    if (!key) return null;
    const cached = twemojiCacheRef.current.get(key);
    if (cached instanceof HTMLImageElement) return cached;
    if (cached === "loading" || cached === "error") return null;

    const url = twemojiUrl(text);
    if (!url) return null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    twemojiCacheRef.current.set(key, "loading");
    img.onload = () => {
      twemojiCacheRef.current.set(key, img);
      setEmojiRenderVersion((v) => v + 1);
    };
    img.onerror = () => {
      twemojiCacheRef.current.set(key, "error");
      setEmojiRenderVersion((v) => v + 1);
    };
    img.src = url;
    return null;
  }, [twemojiCodepoint, twemojiUrl]);

  const dotOffset = useMemo(() => {
    const dots = def.cosmetics.dots ?? [];
    const maxCoord = dots.reduce((acc, d) => Math.max(acc, d.a.r, d.a.c, d.b.r, d.b.c), -Infinity);
    return maxCoord >= Math.max(rows, cols) ? 1 : 0;
  }, [cols, def.cosmetics.dots, rows]);

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

  const normalizeDotRc = useCallback((rc: CellRC): CellRC | null => {
    const shifted = dotOffset ? { r: rc.r - dotOffset, c: rc.c - dotOffset } : rc;
    if (inBounds(shifted.r, shifted.c)) return shifted;
    if (inBounds(rc.r, rc.c)) return rc;
    return null;
  }, [dotOffset, inBounds]);

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
      const boardColumn = (el.closest(".boardColumn") as HTMLElement | null) ?? null;
      const gridLayout = (el.closest(".gridLayout") as HTMLElement | null) ?? null;
      const pane = boardColumn ?? (el.parentElement as HTMLElement | null) ?? el;

      const width = pane.clientWidth || window.innerWidth;

      const topbar = document.querySelector(".topbar") as HTMLElement | null;
      const viewportHeight = Math.max(180, window.innerHeight - (topbar?.offsetHeight ?? 0) - 16);
      const measuredHeight = Math.max(boardColumn?.clientHeight ?? 0, gridLayout?.clientHeight ?? 0, pane.clientHeight || 0);
      const boardHeight = Math.max(0, boardColumn?.clientHeight ?? pane.clientHeight ?? 0);
      const isNarrow = window.matchMedia("(max-width: 760px)").matches;
      const isMobile = window.matchMedia("(max-width: 1000px)").matches;
      const isShort = window.matchMedia("(max-height: 560px)").matches;
      const isLandscape =
        window.matchMedia("(orientation: landscape)").matches ||
        (window.matchMedia("(max-height: 540px)").matches && window.innerWidth > window.innerHeight);

      const height = isMobile
        ? Math.max(160, boardHeight || viewportHeight)
        : measuredHeight > 220
          ? measuredHeight
          : viewportHeight;

      const sideMargin = 8;
      const topBottomPad = 8;
      const spanX = cols + outsideLeft + outsideRight;
      const spanY = rows + outsideTop + outsideBottom;
      const padFactor = isMobile ? 0.14 : 0.68;
      const byWidth = (Math.max(240, width - sideMargin * 2)) / (spanX + padFactor);
      const byHeight = (Math.max(220, height - topBottomPad * 2)) / (spanY + padFactor);

      const desktop = window.matchMedia("(min-width: 1080px)").matches;
      const mobileMinCell = isLandscape ? 18 : isShort ? 19 : 21;
      const maxCell = desktop ? 96 : 72;
      const minCell = isNarrow ? mobileMinCell : 28;
      const next = Math.floor(Math.min(maxCell, Math.max(minCell, Math.min(byWidth, byHeight))));
      setCellPx(next);
      setMobileViewport(isMobile);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, [cols, outsideBottom, outsideLeft, outsideRight, outsideTop, rows]);

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

    if (bgImage) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(bgImage, cellX(0), cellY(0), cellPx * cols, cellPx * rows);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Keep the full Sudoku grid area pure white regardless of global theme.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cellX(0), cellY(0), cellPx * cols, cellPx * rows);

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
      if (!progress.selection.length) return;
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

    const inferredSubgrid = rows === cols ? defaultSubgridForSize(rows) : { r: rows + 1, c: cols + 1 };
    const subgrid = def.cosmetics.subgrid ?? inferredSubgrid;

    const drawGridLines = () => {
      if (def.cosmetics.gridVisible === false) return;
      const unitScale = cellPx / cosmeticUnit;
      const thinGridLine = Math.max(0.9, 1.0 * unitScale);
      const thickGridLine = Math.max(1.8, 2.2 * unitScale);
      ctx.strokeStyle = "#000000";
      for (let i = 0; i <= rows; i++) {
        ctx.lineWidth = i % subgrid.r === 0 ? thickGridLine : thinGridLine;
        ctx.beginPath();
        ctx.moveTo(cellX(0), cellY(i));
        ctx.lineTo(cellX(cols), cellY(i));
        ctx.stroke();
      }

      for (let i = 0; i <= cols; i++) {
        ctx.lineWidth = i % subgrid.c === 0 ? thickGridLine : thinGridLine;
        ctx.beginPath();
        ctx.moveTo(cellX(i), cellY(0));
        ctx.lineTo(cellX(i), cellY(rows));
        ctx.stroke();
      }
    };

    const drawLayer = (
      items: NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>,
      opts?: { drawShapes?: boolean; drawText?: boolean }
    ) => {
      const drawShapes = opts?.drawShapes ?? true;
      const drawText = opts?.drawText ?? true;

      const drawShape = (item: NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>[number], mode: "fill" | "stroke") => {
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

        ctx.save();
        ctx.globalAlpha *= itemOpacity;
        if (angleRad) {
          ctx.translate(cx, cy);
          ctx.rotate(angleRad);
          ctx.translate(-cx, -cy);
        }

        if (mode === "fill") {
          ctx.fillStyle = item.color as string;
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
        } else {
          ctx.strokeStyle = item.borderColor as string;
          const borderWidth = (item.borderThickness ?? 1.4) * (cellPx / cosmeticUnit);
          // SudokuPad-exported layer thickness behaves like an inset (inner) border.
          // Canvas strokes are centered by default, so inset the path by half width.
          ctx.lineWidth = borderWidth;
          const inset = borderWidth / 2;
          const sx = x + inset;
          const sy = y + inset;
          const sw = Math.max(0, rw - borderWidth);
          const sh = Math.max(0, rh - borderWidth);
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
        }
        ctx.restore();
      };

      if (drawShapes) {
        // Preserve source item ordering (SudokuPad semantics): each shape paints
        // its own fill and stroke before moving to the next item.
        for (const item of items) {
          if (item.color) drawShape(item, "fill");
          if (item.borderColor) drawShape(item, "stroke");
        }
      }

      for (const item of items) {
        if (drawText && item.text != null && String(item.text).length) {
          const angleRad = (Number(item.angle) || 0) * (Math.PI / 180);
          const itemOpacity = Number.isFinite(item.opacity) ? Math.max(0, Math.min(1, Number(item.opacity))) : 1;
          const cx = worldX(item.center.x);
          const cy = worldY(item.center.y);
          ctx.save();
          ctx.globalAlpha *= itemOpacity;
          if (angleRad) {
            ctx.translate(cx, cy);
            ctx.rotate(angleRad);
            ctx.translate(-cx, -cy);
          }
          ctx.fillStyle = item.textColor ?? "#111111";
          const pxRaw = (item.textSize ?? 16) * (cellPx / cosmeticUnit);
          const tinyAnchorText =
            typeof item.width === "number" &&
            typeof item.height === "number" &&
            item.width <= 0.35 &&
            item.height <= 0.35 &&
            String(item.text).trim().length <= 2;
          const px = tinyAnchorText ? Math.max(pxRaw, 8.5) : pxRaw;
          const text = String(item.text);
          const hasEmoji = /\p{Extended_Pictographic}/u.test(text);
          ctx.font = hasEmoji
            ? `${Math.max(10, px)}px ${emojiTextFont}`
            : `600 ${Math.max(10, px)}px ${gridTextFont}, ${emojiTextFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const tx = worldX(item.center.x);
          const ty = worldY(item.center.y);
          const onOrOutsideGridBorder =
            item.center.x <= 0.02 ||
            item.center.x >= cols - 0.02 ||
            item.center.y <= 0.02 ||
            item.center.y >= rows - 0.02 ||
            item.center.x < 0 ||
            item.center.x > cols ||
            item.center.y < 0 ||
            item.center.y > rows;

          const isTightNumberLabel = /^\d{2,}$/.test(text) && !onOrOutsideGridBorder;
          const twemoji = hasEmoji ? getTwemojiImage(text) : null;
          if (twemoji) {
            const sz = Math.max(10, px);
            ctx.drawImage(twemoji, tx - sz / 2, ty - sz / 2, sz, sz);
          } else if (isTightNumberLabel) {
            const chars = Array.from(text);
            const widths = chars.map((ch) => ctx.measureText(ch).width);
            const kerning = Math.max(0.6, px * 0.22);
            const total = widths.reduce((a, b) => a + b, 0) - kerning * (chars.length - 1);
            let cursor = tx - total / 2;
            for (let i = 0; i < chars.length; i++) {
              const w = widths[i] as number;
              ctx.fillText(chars[i] as string, cursor + w / 2, ty);
              cursor += w - kerning;
            }
          } else {
            ctx.fillText(text, tx, ty);
          }
          ctx.restore();
        }
      }
    };

    const drawConstraintLines = (layer: "under" | "over") => {
      if (!def.cosmetics.lines) return;
      const classifyTarget = (target: string | undefined): "under" | "over" => {
        // SudokuPad-style default: line art sits under the grid unless explicitly set over.
        const t = (target ?? "underlay").toLowerCase();
        if (/(^|[^a-z])(under|underlay|back|background|behind|below|bottom)([^a-z]|$)/.test(t)) return "under";
        if (/(^|[^a-z])(over|overlay|front|foreground|above|top)([^a-z]|$)/.test(t)) return "over";
        return "under";
      };
      for (const ln of def.cosmetics.lines) {
        if (ln.wayPoints.length < 2) continue;
        const isUnder = classifyTarget(ln.target) === "under";
        if (layer === "under" ? !isUnder : isUnder) continue;
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
        } else {
          ctx.save();
          ctx.globalAlpha *= lineOpacity;
          if (ln.dashArray?.length) ctx.setLineDash(ln.dashArray);
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
        }
      }
    };

    const underlayItems = def.cosmetics.underlays ?? [];

    // Draw underlay polygon/line art first.
    drawConstraintLines("under");
    if (underlayItems.length) drawLayer(underlayItems, { drawShapes: true, drawText: true });

    // Highlights sit above puzzle artwork but below grid/features and values.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const colors = progress.cells[r][c].highlights ?? [];
        drawCellHighlights(r, c, colors);
      }
    }

    const drawCages = () => {
      if (!def.cosmetics.cages) return;
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
      for (const cage of def.cosmetics.cages) {
        const cageOpacity = Number.isFinite(cage.opacity) ? Math.max(0, Math.min(1, Number(cage.opacity))) : 1;
        const cageStroke = cage.color ?? "#000000";
        const cageLineWidth = (cage.thickness ?? 1.25) * (cellPx / cosmeticUnit);
        const cageDash = cage.dashArray?.length ? cage.dashArray : [5, 3];
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
          const inset = 3;
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
        if (cage.sum) {
          const first = cage.cells[0];
          if (!hasMatchingCornerLabel(cage.cells, cage.sum)) {
            ctx.fillStyle = cage.textColor ?? cage.color ?? "#111111";
            ctx.font = `12px ${gridTextFont}, ${emojiTextFont}`;
            ctx.fillText(cage.sum, cellX(first.c) + 6, cellY(first.r) + 14);
          }
        }
      }
    };

    const drawArrows = () => {
      if (!def.cosmetics.arrows) return;
      for (const a of def.cosmetics.arrows) {
        const stroke = a.color ?? "#59606b";
        const lineW = (a.thickness ?? 4.2) * (cellPx / cosmeticUnit);
        const bulbRadius = Math.max(8, cellPx * 0.2);
        const bulbStrokeWidth = (a.bulbStrokeThickness ?? 1.6) * (cellPx / cosmeticUnit);
        const waypointPath = Array.isArray(a.wayPoints) && a.wayPoints.length >= 2
          ? a.wayPoints
          : null;

        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineW;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        if (waypointPath) {
          waypointPath.forEach((p, i) => {
            const x = worldX(p.x);
            const y = worldY(p.y);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
        } else {
          const cellPath = Array.isArray(a.path) ? a.path : [];
          cellPath.forEach((rc, i) => {
            const x = cellX(rc.c) + cellPx / 2;
            const y = cellY(rc.r) + cellPx / 2;
            if (i === 0) {
              if (cellPath.length > 1 && a.bulb) {
                const n0 = cellPath[1] as CellRC;
                const nx = cellX(n0.c) + cellPx / 2;
                const ny = cellY(n0.r) + cellPx / 2;
                const vx = nx - x;
                const vy = ny - y;
                const vl = Math.hypot(vx, vy) || 1;
                ctx.moveTo(x + (vx / vl) * bulbRadius * 0.92, y + (vy / vl) * bulbRadius * 0.92);
              } else {
                ctx.moveTo(x, y);
              }
            } else {
              ctx.lineTo(x, y);
            }
          });
        }
        ctx.stroke();

        const pathPoints = waypointPath
          ? waypointPath.map((p) => ({ x: worldX(p.x), y: worldY(p.y) }))
          : (Array.isArray(a.path) ? a.path : []).map((rc) => ({ x: cellX(rc.c) + cellPx / 2, y: cellY(rc.r) + cellPx / 2 }));

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
          const headLen = Number.isFinite(a.headLength) ? Math.max(6, Number(a.headLength) * cellPx) : Math.max(8, cellPx * 0.23);
          const headWidth = Math.max(6, cellPx * 0.15);
          const bx = ex - ux * headLen;
          const by = ey - uy * headLen;
          ctx.fillStyle = stroke;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(bx + nx * headWidth, by + ny * headWidth);
          ctx.lineTo(bx - nx * headWidth, by - ny * headWidth);
          ctx.closePath();
          ctx.fill();
        }

        if (a.bulb) {
          const b = a.bulb;
          ctx.fillStyle = a.bulbFill ?? "#ffffff";
          ctx.beginPath();
          ctx.arc(cellX(b.c) + cellPx / 2, cellY(b.r) + cellPx / 2, bulbRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = a.bulbStroke ?? "#222222";
          ctx.lineWidth = bulbStrokeWidth;
          ctx.stroke();
        }
      }
    };

    const drawDots = () => {
      if (!def.cosmetics.dots) return;
      for (const d of def.cosmetics.dots) {
        const a = normalizeDotRc(d.a);
        const b = normalizeDotRc(d.b);
        if (!a || !b) continue;
        const ax = cellX(a.c) + cellPx / 2;
        const ay = cellY(a.r) + cellPx / 2;
        const bx = cellX(b.c) + cellPx / 2;
        const by = cellY(b.r) + cellPx / 2;
        const x = (ax + bx) / 2;
        const y = (ay + by) / 2;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = d.kind === "white" ? "#ffffff" : "#1b1b1b";
        ctx.fill();
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    const drawTopPuzzleFeatures = () => {
      drawCages();
      drawConstraintLines("over");
      if (def.cosmetics.overlays?.length) {
        drawLayer(def.cosmetics.overlays as NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>);
      }
      drawArrows();
    };

    const fogDefined = (def.cosmetics.fogLights?.length ?? 0) > 0 || (def.cosmetics.fogTriggerEffects?.length ?? 0) > 0;

    // Grid below top puzzle artwork so features are not bisected by grid lines.
    drawGridLines();
    if (!fogDefined) drawTopPuzzleFeatures();

    const drawCenterStroke = (segments: LineSegmentDraft[], color: string, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
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
      ctx.lineWidth = 3.8;
      ctx.lineCap = "round";
      for (const seg of segments) {
        const dr = Math.abs(seg.b.r - seg.a.r);
        const dc = Math.abs(seg.b.c - seg.a.c);
        if (dr + dc !== 1) continue;
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
        ctx.lineWidth = 3;
        if (mark.kind === "circle") {
          ctx.beginPath();
          ctx.arc(x, y, Math.max(7, cellPx * 0.18), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const r = Math.max(7, cellPx * 0.18);
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
        ctx.lineWidth = 2.6;
        const r = Math.max(4, cellPx * 0.11);
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
    const valueFontPx = Math.max(11, Math.min(42, Math.round(cellPx * 0.58)));
    const noteFontPx = Math.max(6, Math.min(16, Math.round(cellPx * 0.22)));
    const candidateFontPx = Math.max(5, Math.min(12, Math.round(cellPx * 0.18)));
    const cornerInsetX = Math.max(2, Math.round(cellPx * 0.08));
    const cornerBaseY = Math.max(7, Math.round(cellPx * 0.22));
    if (fogDefined) {
      const addLight = (rc: CellRC) => {
        if (!inBounds(rc.r, rc.c)) return;
        lit[rc.r][rc.c] = true;
      };

      for (const rc of def.cosmetics.fogLights ?? []) addLight(rc);

      const solution = def.cosmetics.solution;
      const isCorrect = (rc: CellRC) => {
        if (!inBounds(rc.r, rc.c)) return false;
        if (solution && solution.length >= rows * cols) {
          const idx = rc.r * cols + rc.c;
          return (progress.cells[rc.r][rc.c].value ?? "") === solution[idx];
        }
        const given = progress.cells[rc.r][rc.c].given;
        return Boolean(given && progress.cells[rc.r][rc.c].value === given);
      };

      for (const effect of def.cosmetics.fogTriggerEffects ?? []) {
        const mode = effect.triggerMode;
        const satisfied = mode === "or"
          ? effect.triggerCells.some(isCorrect)
          : effect.triggerCells.every(isCorrect);
        if (!satisfied) continue;
        for (const rc of effect.revealCells) addLight(rc);
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = progress.cells[r][c];
        const x0 = cellX(c);
        const y0 = cellY(r);

        if (cell.value) {
          ctx.fillStyle = cell.given ? "#111111" : "#123f9a";
          ctx.font = cell.given ? `700 ${valueFontPx}px ${gridTextFont}, ${emojiTextFont}` : `650 ${valueFontPx}px ${gridTextFont}, ${emojiTextFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(cell.value, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
        } else {
          ctx.fillStyle = "#1e2633";
          ctx.font = `${noteFontPx}px ${gridTextFont}, ${emojiTextFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const corner = [...cell.notes.corner].sort();
          if (corner.length) {
            const hasCageLabel = cageLabelCells.has(`${r},${c}`);
            ctx.textAlign = "left";
            ctx.fillText(corner.join(""), x0 + cornerInsetX, y0 + (hasCageLabel ? cornerBaseY * 2 : cornerBaseY));
          }

          const center = [...cell.notes.center].sort();
          if (center.length) {
            ctx.textAlign = "center";
            ctx.fillText(center.join(""), x0 + cellPx / 2, y0 + cellPx / 2);
          }

          const cand = new Set(cell.notes.candidates);
          if (cand.size) {
            ctx.font = `${candidateFontPx}px ${gridTextFont}, ${emojiTextFont}`;
            ctx.textAlign = "center";
            const sym = Array.from(cand).sort();
            for (const s of sym) {
              const idx = Number.isFinite(Number(s)) ? Number(s) : s.charCodeAt(0) - 64;
              if (!idx) continue;
              const rr = Math.floor((idx - 1) / 3);
              const cc = (idx - 1) % 3;
              ctx.fillText(s, x0 + (cc + 0.5) * (cellPx / 3), y0 + (rr + 0.5) * (cellPx / 3));
            }
          }
        }

      }
    }

    if (fogDefined) {
      ctx.fillStyle = "#c8cdd3";
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

      // Keep puzzle feature layers above highlights under fog, but only in lit cells.
      ctx.save();
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!lit[r][c]) continue;
          ctx.rect(cellX(c), cellY(r), cellPx, cellPx);
        }
      }
      ctx.clip();
      drawTopPuzzleFeatures();
      ctx.restore();

      // Keep grid visible on top of fog when enabled.
      if (def.cosmetics.gridVisible !== false) {
        const unitScale = cellPx / cosmeticUnit;
        const thinGridLine = Math.max(0.9, 1.0 * unitScale);
        const thickGridLine = Math.max(1.9, 2.5 * unitScale);
        ctx.strokeStyle = "#000000";
        for (let i = 0; i <= rows; i++) {
          ctx.lineWidth = i % subgrid.r === 0 ? thickGridLine : thinGridLine;
          ctx.beginPath();
          ctx.moveTo(cellX(0), cellY(i));
          ctx.lineTo(cellX(cols), cellY(i));
          ctx.stroke();
        }

        for (let i = 0; i <= cols; i++) {
          ctx.lineWidth = i % subgrid.c === 0 ? thickGridLine : thinGridLine;
          ctx.beginPath();
          ctx.moveTo(cellX(i), cellY(0));
          ctx.lineTo(cellX(i), cellY(rows));
          ctx.stroke();
        }
      }

      // Keep user-entered values visible under fog; hide unrevealed givens.
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = progress.cells[r][c];
          const x0 = cellX(c);
          const y0 = cellY(r);

          if (cell.value) {
            if (cell.given && !lit[r][c]) continue;
            ctx.fillStyle = cell.given ? "#111111" : "#123f9a";
            ctx.font = cell.given ? `700 ${valueFontPx}px ${gridTextFont}, ${emojiTextFont}` : `650 ${valueFontPx}px ${gridTextFont}, ${emojiTextFont}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.value, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
            continue;
          }

          if (cell.given) continue;
          ctx.fillStyle = "#1e2633";
          ctx.font = `${noteFontPx}px ${gridTextFont}, ${emojiTextFont}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const corner = [...cell.notes.corner].sort();
          if (corner.length) {
            ctx.textAlign = "left";
            ctx.fillText(corner.join(""), x0 + cornerInsetX, y0 + cornerBaseY);
          }

          const center = [...cell.notes.center].sort();
          if (center.length) {
            ctx.textAlign = "center";
            ctx.fillText(center.join(""), x0 + cellPx / 2, y0 + cellPx / 2);
          }
        }
      }
    }

    // Always keep user lines on top of artwork/fog.
    drawUserLines();

    // Dots should sit above grid/user lines.
    if (fogDefined) {
      ctx.save();
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!lit[r][c]) continue;
          ctx.rect(cellX(c), cellY(r), cellPx, cellPx);
        }
      }
      ctx.clip();
      drawDots();
      ctx.restore();
    } else {
      drawDots();
    }

    drawSelectionOutlines();
  }, [
    bgImage,
    boardH,
    boardW,
    cellPx,
    def,
    dotOffset,
    emojiRenderVersion,
    getTwemojiImage,
    heightPx,
    highlightRotationRad,
    linePreview,
    cols,
    originX,
    originY,
    pad,
    progress,
    rows,
    cellX,
    cellY,
    inBounds,
    normalizeDotRc,
    worldX,
    worldY,
    widthPx,
  ]);

  function eventPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const bx = clientX - rect.left - originX;
    const by = clientY - rect.top - originY;
    const c = Math.floor(bx / cellPx);
    const r = Math.floor(by / cellPx);
    if (!inBounds(r, c)) return null;
    const fx = bx / cellPx - c;
    const fy = by / cellPx - r;
    return { r, c, fx, fy };
  }

  function eventGridPoint(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const gx = (clientX - rect.left - originX) / cellPx;
    const gy = (clientY - rect.top - originY) / cellPx;
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

  function traceCellSteps(from: CellRC, to: CellRC, boundsInclusive: { rows: number; cols: number }) {
    const dr = to.r - from.r;
    const dc = to.c - from.c;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    if (steps <= 0) return [] as CellRC[];

    const out: CellRC[] = [];
    let prev = from;
    for (let i = 1; i <= steps; i++) {
      const r = Math.round(from.r + (dr * i) / steps);
      const c = Math.round(from.c + (dc * i) / steps);
      const bounded =
        r >= 0 &&
        c >= 0 &&
        r < boundsInclusive.rows &&
        c < boundsInclusive.cols;
      if (!bounded) continue;
      if (r === prev.r && c === prev.c) continue;
      prev = { r, c };
      out.push(prev);
    }
    return out;
  }

  function centerHopsFromPointer(
    last: CellRC,
    clientX: number,
    clientY: number,
    opts?: { diagonalAssistThreshold?: number }
  ): CellRC[] {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return [];

    const target = { x: gp.gx - 0.5, y: gp.gy - 0.5 };
    const diagonalAssistThreshold = Math.max(0, Math.min(0.49, opts?.diagonalAssistThreshold ?? 0.5));
    const hops: CellRC[] = [];
    let cur = { ...last };

    for (let i = 0; i < 10; i++) {
      const dx = target.x - cur.c;
      const dy = target.y - cur.r;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const stepCX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
      const stepRY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      let stepC = absDx >= 0.5 ? stepCX : 0;
      let stepR = absDy >= 0.5 ? stepRY : 0;

      // Widen diagonal routing corridor so near-corner drags prefer diagonal hops.
      if (!stepC && stepR && stepCX && absDx >= diagonalAssistThreshold) stepC = stepCX;
      if (!stepR && stepC && stepRY && absDy >= diagonalAssistThreshold) stepR = stepRY;

      if (!stepR && !stepC) break;

      const next = { r: cur.r + stepR, c: cur.c + stepC };
      if (!inBounds(next.r, next.c)) break;
      if (next.r === cur.r && next.c === cur.c) break;
      hops.push(next);
      cur = next;
    }

    return hops;
  }

  function nearestCornerNode(clientX: number, clientY: number, radius = 0.34): CellRC | null {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return null;
    const c = Math.round(gp.gx);
    const r = Math.round(gp.gy);
    if (r < 0 || c < 0 || r > rows || c > cols) return null;
    const d = Math.hypot(gp.gx - c, gp.gy - r);
    if (d > radius) return null;
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
    const pt = eventPoint(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rc = { r: pt.r, c: pt.c };
    if (progress.activeTool === "line") {
      const kind = resolveInitialLineKind(pt);
      const edgeTapCandidate = kind === "edge" ? pickEdgeByPointer(e.clientX, e.clientY, 0.47) ?? undefined : undefined;
      const start = kind === "edge"
        ? nearestCornerNode(e.clientX, e.clientY, 0.42) ?? nearestCornerNodeLoose(e.clientX, e.clientY)
        : nearestCellCenter(e.clientX, e.clientY) ?? rc;
      if (!start) return;
      dragRef.current = {
        path: [start],
        segments: [],
        last: start,
        moved: false,
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
    const drag = dragRef.current;
    if (!drag) return;

    if (progress.activeTool === "line") {
      const kind = drag.lineKind ?? "center";
      const prevCell = drag.path[drag.path.length - 2] ?? null;
      const hops = kind === "edge"
        ? (() => {
            const next = nearestCornerNode(e.clientX, e.clientY, 0.42);
            if (!next || (next.r === drag.last.r && next.c === drag.last.c)) return [] as CellRC[];
            return traceCellSteps(drag.last, next, { rows: rows + 1, cols: cols + 1 });
          })()
        : centerHopsFromPointer(drag.last, e.clientX, e.clientY);
      if (!hops.length) return;

      for (const hop of hops) {
        const dr = hop.r - drag.last.r;
        const dc = hop.c - drag.last.c;
        if (Math.abs(dr) > 1 || Math.abs(dc) > 1) continue;
        if (kind === "edge" && Math.abs(dr) + Math.abs(dc) !== 1) continue;

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
    dragRef.current = null;
    setLinePreview(null);
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const pt = eventPoint(e.clientX, e.clientY);
    if (!pt) return;
    props.onDoubleCell({ r: pt.r, c: pt.c });
  }

  return (
    <div ref={wrapRef} className="boardSurface" style={{ display: "grid", placeItems: "center", maxWidth: "100%", maxHeight: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", margin: "0 auto", maxWidth: "100%", maxHeight: "100%", touchAction: "none", userSelect: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onPointerLeave={onCancel}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}
