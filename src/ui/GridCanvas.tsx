import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellRC, PuzzleDefinition, PuzzleProgress } from "../core/model";

type LineKindResolved = "center" | "edge";
type EdgeTrack = "top" | "bottom" | "left" | "right";
type LineSegmentDraft = { a: CellRC; b: CellRC; edgeTrack?: EdgeTrack };
type LayerItem = NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>[number];

type DragState = {
  path: CellRC[];
  segments: LineSegmentDraft[];
  last: CellRC;
  moved: boolean;
  lineKind?: LineKindResolved;
  lineAction?: "draw" | "erase";
  visited: Set<string>;
  selectionSet?: Set<string>;
  selectionMode?: "replace" | "add" | "remove";
  startedSelected?: boolean;
  startedCellKey?: string;
  startedSelectionSize?: number;
};

function rcKey(rc: CellRC) {
  return `${rc.r},${rc.c}`;
}

function segKey(a: CellRC, b: CellRC) {
  const ak = rcKey(a);
  const bk = rcKey(b);
  return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`;
}

function segKeyWithTrack(seg: { a: CellRC; b: CellRC; edgeTrack?: EdgeTrack }) {
  return segKey(seg.a, seg.b);
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

  const n = def.size;
  const [cellPx, setCellPx] = useState(56);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [linePreview, setLinePreview] = useState<{ segments: LineSegmentDraft[]; kind: LineKindResolved } | null>(null);

  const pad = Math.max(14, Math.round(cellPx * 0.32));
  const worldBounds = useMemo(() => {
    let minX = 0;
    let minY = 0;
    let maxX = n;
    let maxY = n;

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
      includePoint(cx, cy);

      const hasExplicitBox = Number.isFinite(item?.width) || Number.isFinite(item?.height);
      const hasShape = Boolean(item?.color || item?.borderColor || item?.rounded);
      const w = Number.isFinite(item?.width) ? Number(item.width) : hasShape || hasExplicitBox ? 1 : 0;
      const h = Number.isFinite(item?.height) ? Number(item.height) : hasShape || hasExplicitBox ? 1 : 0;
      if (w <= 0 && h <= 0) return;
      includePoint(cx - w / 2, cy - h / 2);
      includePoint(cx + w / 2, cy + h / 2);
    };

    for (const item of def.cosmetics.overlays ?? []) includeLayer(item);
    for (const item of def.cosmetics.underlays ?? []) includeLayer(item);
    for (const ln of def.cosmetics.lines ?? []) {
      for (const p of ln.wayPoints) includePoint(p.x, p.y);
    }

    return { minX, minY, maxX, maxY };
  }, [def.cosmetics.lines, def.cosmetics.overlays, def.cosmetics.underlays, n]);

  const outsideLeft = Math.max(0, -worldBounds.minX);
  const outsideTop = Math.max(0, -worldBounds.minY);
  const outsideRight = Math.max(0, worldBounds.maxX - n);
  const outsideBottom = Math.max(0, worldBounds.maxY - n);

  const originX = pad + outsideLeft * cellPx;
  const originY = pad + outsideTop * cellPx;
  const boardW = cellPx * (n + outsideLeft + outsideRight);
  const boardH = cellPx * (n + outsideTop + outsideBottom);
  const widthPx = Math.max(1, Math.ceil(pad * 2 + boardW));
  const heightPx = Math.max(1, Math.ceil(pad * 2 + boardH));

  const worldX = useCallback((x: number) => originX + x * cellPx, [originX, cellPx]);
  const worldY = useCallback((y: number) => originY + y * cellPx, [originY, cellPx]);
  const cellX = useCallback((c: number) => originX + c * cellPx, [originX, cellPx]);
  const cellY = useCallback((r: number) => originY + r * cellPx, [originY, cellPx]);

  const dotOffset = useMemo(() => {
    const dots = def.cosmetics.dots ?? [];
    const maxCoord = dots.reduce((acc, d) => Math.max(acc, d.a.r, d.a.c, d.b.r, d.b.c), -Infinity);
    return maxCoord >= n ? 1 : 0;
  }, [def.cosmetics.dots, n]);

  const highlightRotationRad = (20 * Math.PI) / 180;
  const highlightAlpha = 0.82;

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
    return r >= 0 && c >= 0 && r < n && c < n;
  }, [n]);

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

  function normalizeFeatureLineColor(color?: string): string {
    if (!color) return "#000000";
    const v = color.trim().toLowerCase();
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (hex) {
      const raw = hex[1] as string;
      const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      return luma < 0.5 ? "#000000" : color;
    }

    const rgb = /^rgba?\(([^)]+)\)$/.exec(v);
    if (rgb) {
      const parts = rgb[1].split(",").map((p) => Number(p.trim()));
      if (parts.length >= 3) {
        const [r, g, b] = parts;
        const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        return luma < 0.5 ? "#000000" : color;
      }
    }

    return color;
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
      const spanX = n + outsideLeft + outsideRight;
      const spanY = n + outsideTop + outsideBottom;
      const padFactor = 0.68;
      const byWidth = (Math.max(240, width - sideMargin * 2)) / (spanX + padFactor);
      const byHeight = (Math.max(220, height - topBottomPad * 2)) / (spanY + padFactor);

      const desktop = window.matchMedia("(min-width: 1080px)").matches;
      const mobileMinCell = isLandscape ? 18 : isShort ? 19 : 21;
      const maxCell = desktop ? 96 : 72;
      const minCell = isNarrow ? mobileMinCell : 28;
      const next = Math.floor(Math.min(maxCell, Math.max(minCell, Math.min(byWidth, byHeight))));
      setCellPx(next);
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
  }, [n, outsideBottom, outsideLeft, outsideRight, outsideTop]);

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
      ctx.drawImage(bgImage, cellX(0), cellY(0), cellPx * n, cellPx * n);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Keep the full Sudoku grid area pure white regardless of global theme.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cellX(0), cellY(0), cellPx * n, cellPx * n);

    const drawCellHighlights = (r: number, c: number, colors: string[], alpha = highlightAlpha) => {
      if (!colors.length) return;
      const x = cellX(c);
      const y = cellY(r);
      const cx = x + cellPx / 2;
      const cy = y + cellPx / 2;

      if (colors.length === 1) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, cellPx, cellPx);
        ctx.clip();
        ctx.translate(cx, cy);
        ctx.rotate(highlightRotationRad);
        ctx.translate(-cx, -cy);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colors[0] as string;
        const singleSize = cellPx * 0.88;
        ctx.fillRect(cx - singleSize / 2, cy - singleSize / 2, singleSize, singleSize);
        ctx.restore();
        return;
      }

      const radius = cellPx * 0.78;
      const maxSlices = Math.min(18, colors.length);
      const step = (Math.PI * 2) / maxSlices;
      const offset = -Math.PI / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(highlightRotationRad);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.rect(x, y, cellPx, cellPx);
      ctx.clip();
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

    const subgrid = (() => {
      if (n === 6) return { r: 2, c: 3 };
      if (n === 8) return { r: 2, c: 4 };
      if (n === 10) return { r: 2, c: 5 };
      if (n === 12) return { r: 3, c: 4 };
      const s = Math.sqrt(n);
      if (Number.isInteger(s)) return { r: s, c: s };
      return { r: 1, c: 1 };
    })();

    const drawGridLines = () => {
      for (let i = 0; i <= n; i++) {
        ctx.lineWidth = i % subgrid.r === 0 ? 2.2 : 1;
        ctx.strokeStyle = "#000000";
        ctx.beginPath();
        ctx.moveTo(cellX(0), cellY(i));
        ctx.lineTo(cellX(n), cellY(i));
        ctx.stroke();

        ctx.lineWidth = i % subgrid.c === 0 ? 2.2 : 1;
        ctx.beginPath();
        ctx.moveTo(cellX(i), cellY(0));
        ctx.lineTo(cellX(i), cellY(n));
        ctx.stroke();
      }
    };

    const drawLayer = (
      items: NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>,
      opts?: { drawShapes?: boolean; drawText?: boolean }
    ) => {
      const drawShapes = opts?.drawShapes ?? true;
      const drawText = opts?.drawText ?? true;
      for (const item of items) {
        const w = Number.isFinite(item.width) ? item.width! : 1;
        const h = Number.isFinite(item.height) ? item.height! : 1;
        const x = worldX(item.center.x - w / 2);
        const y = worldY(item.center.y - h / 2);
        const rw = w * cellPx;
        const rh = h * cellPx;
        const cx = worldX(item.center.x);
        const cy = worldY(item.center.y);
        const angleRad = (Number(item.angle) || 0) * (Math.PI / 180);

        if (drawShapes && item.color) {
          ctx.save();
          if (angleRad) {
            ctx.translate(cx, cy);
            ctx.rotate(angleRad);
            ctx.translate(-cx, -cy);
          }
          ctx.fillStyle = item.color;
          if (item.rounded) {
            ctx.beginPath();
            ctx.roundRect(x, y, rw, rh, Math.min(14, cellPx * 0.25));
            ctx.fill();
          } else {
            ctx.fillRect(x, y, rw, rh);
          }
          ctx.restore();
        }

        if (drawShapes && item.borderColor) {
          ctx.save();
          if (angleRad) {
            ctx.translate(cx, cy);
            ctx.rotate(angleRad);
            ctx.translate(-cx, -cy);
          }
          ctx.strokeStyle = item.borderColor;
          ctx.lineWidth = (item.borderThickness ?? 1.4) * (cellPx / 56);
          if (item.rounded) {
            ctx.beginPath();
            ctx.roundRect(x, y, rw, rh, Math.min(14, cellPx * 0.25));
            ctx.stroke();
          } else {
            ctx.strokeRect(x, y, rw, rh);
          }
          ctx.restore();
        }

        if (drawText && item.text != null && String(item.text).length) {
          ctx.save();
          if (angleRad) {
            ctx.translate(cx, cy);
            ctx.rotate(angleRad);
            ctx.translate(-cx, -cy);
          }
          ctx.fillStyle = item.textColor ?? "#111111";
          const px = (item.textSize ?? 16) * (cellPx / 56);
          ctx.font = `600 ${Math.max(10, px)}px ui-sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const text = String(item.text);
          const tx = worldX(item.center.x);
          const ty = worldY(item.center.y);
          const onOrOutsideGridBorder =
            item.center.x <= 0.02 ||
            item.center.x >= n - 0.02 ||
            item.center.y <= 0.02 ||
            item.center.y >= n - 0.02 ||
            item.center.x < 0 ||
            item.center.x > n ||
            item.center.y < 0 ||
            item.center.y > n;

          if (onOrOutsideGridBorder) {
            const metrics = ctx.measureText(text);
            const wPad = 6;
            const hPad = 2;
            const bw = Math.ceil(metrics.width + wPad * 2);
            const bh = Math.ceil(Math.max(px, 12) + hPad * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(tx - bw / 2, ty - bh / 2, bw, bh);
            ctx.fillStyle = item.textColor ?? "#111111";
          }

          ctx.fillText(text, tx, ty);
          ctx.restore();
        }
      }
    };

    if (def.cosmetics.underlays?.length) drawLayer(def.cosmetics.underlays, { drawShapes: true, drawText: true });
    if (def.cosmetics.overlays?.length) drawLayer(def.cosmetics.overlays);

    // Highlights sit above puzzle artwork but below grid/features and values.
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const colors = progress.cells[r][c].highlights ?? [];
        drawCellHighlights(r, c, colors);
      }
    }

    if (def.cosmetics.cages) {
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 3]);
      for (const cage of def.cosmetics.cages) {
        const set = new Set(cage.cells.map((rc) => `${rc.r},${rc.c}`));
        const cageFill = cage.color ? darkenColor(cage.color, -0.05) : undefined;
        for (const rc of cage.cells) {
          if (cageFill) {
            ctx.fillStyle = cageFill;
            ctx.globalAlpha = 0.12;
            ctx.fillRect(cellX(rc.c) + 2, cellY(rc.r) + 2, cellPx - 4, cellPx - 4);
            ctx.globalAlpha = 1;
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
        }
        if (cage.sum) {
          const first = cage.cells[0];
          ctx.fillStyle = "#111111";
          ctx.font = "12px ui-sans-serif";
          ctx.fillText(cage.sum, cellX(first.c) + 6, cellY(first.r) + 14);
        }
      }
      ctx.setLineDash([]);
    }

    if (def.cosmetics.lines) {
      for (const ln of def.cosmetics.lines) {
        if (ln.wayPoints.length < 2) continue;
        ctx.strokeStyle = normalizeFeatureLineColor(ln.color);
        ctx.lineWidth = (ln.thickness ?? 6) * (cellPx / 50);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ln.wayPoints.forEach((p, i) => {
          const x = worldX(p.x);
          const y = worldY(p.y);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }

    if (def.cosmetics.arrows) {
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 3;
      for (const a of def.cosmetics.arrows) {
        ctx.beginPath();
        a.path.forEach((rc, i) => {
          const x = cellX(rc.c) + cellPx / 2;
          const y = cellY(rc.r) + cellPx / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        const b = a.bulb;
        ctx.fillStyle = "#111111";
        ctx.beginPath();
        ctx.arc(cellX(b.c) + cellPx / 2, cellY(b.r) + cellPx / 2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (def.cosmetics.dots) {
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
    }

    // Grid borders stay above highlights.
    drawGridLines();

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
        ? new Set(linePreview.segments.map(segKeyWithTrack))
        : null;
      const erasePreview = Boolean(
        previewKeys &&
          progress.lines.some((stroke) =>
            stroke.segments.some((seg) => previewKeys.has(segKeyWithTrack(seg)))
          )
      );

      for (const stroke of progress.lines) {
        const segments = erasePreview && previewKeys
          ? stroke.segments.filter((seg) => !previewKeys.has(segKeyWithTrack(seg)))
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
        const x = (cellX(mark.a.c) + cellX(mark.b.c)) / 2;
        const y = (cellY(mark.a.r) + cellY(mark.b.r)) / 2;
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

    const lit = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
    const fogDefined = (def.cosmetics.fogLights?.length ?? 0) > 0 || (def.cosmetics.fogTriggerEffects?.length ?? 0) > 0;
    if (fogDefined) {
      const addLight = (rc: CellRC) => {
        if (!inBounds(rc.r, rc.c)) return;
        lit[rc.r][rc.c] = true;
      };

      for (const rc of def.cosmetics.fogLights ?? []) addLight(rc);

      const solution = def.cosmetics.solution;
      const isCorrect = (rc: CellRC) => {
        if (!inBounds(rc.r, rc.c)) return false;
        if (solution && solution.length >= n * n) {
          const idx = rc.r * n + rc.c;
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

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = progress.cells[r][c];
        const x0 = cellX(c);
        const y0 = cellY(r);

        if (cell.value) {
          ctx.fillStyle = cell.given ? "#111111" : "#123f9a";
          ctx.font = cell.given ? "700 26px ui-sans-serif" : "650 26px ui-sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(cell.value, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
        } else {
          ctx.fillStyle = "#1e2633";
          ctx.font = "12px ui-sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const corner = [...cell.notes.corner].sort();
          if (corner.length) {
            ctx.textAlign = "left";
            ctx.fillText(corner.join(""), x0 + 4, y0 + 12);
          }

          const center = [...cell.notes.center].sort();
          if (center.length) {
            ctx.textAlign = "center";
            ctx.fillText(center.join(""), x0 + cellPx / 2, y0 + cellPx / 2);
          }

          const cand = new Set(cell.notes.candidates);
          if (cand.size) {
            ctx.font = "10px ui-sans-serif";
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

        if (cell.given) {
          ctx.fillStyle = "rgba(32, 68, 112, .06)";
          ctx.fillRect(x0 + 2, y0 + 2, cellPx - 4, cellPx - 4);
        }
      }
    }

    if (fogDefined) {
      ctx.fillStyle = "#c8cdd3";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (lit[r][c]) continue;
          ctx.fillRect(cellX(c), cellY(r), cellPx, cellPx);
        }
      }

      // Keep user highlights visible under fog, slightly darkened.
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const colors = progress.cells[r][c].highlights ?? [];
          if (!colors.length) continue;
          const display = lit[r][c] ? colors : colors.map((col) => darkenColor(col, 0.3));
          drawCellHighlights(r, c, display, highlightAlpha);
        }
      }

      // Keep grid visible on top of fog.
      for (let i = 0; i <= n; i++) {
        ctx.lineWidth = i % subgrid.r === 0 ? 2.5 : 1;
        ctx.strokeStyle = "#000000";
        ctx.beginPath();
        ctx.moveTo(cellX(0), cellY(i));
        ctx.lineTo(cellX(n), cellY(i));
        ctx.stroke();

        ctx.lineWidth = i % subgrid.c === 0 ? 2.5 : 1;
        ctx.beginPath();
        ctx.moveTo(cellX(i), cellY(0));
        ctx.lineTo(cellX(i), cellY(n));
        ctx.stroke();
      }

      // Keep user-entered values visible under fog; hide unrevealed givens.
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const cell = progress.cells[r][c];
          const x0 = cellX(c);
          const y0 = cellY(r);

          if (cell.value) {
            if (cell.given && !lit[r][c]) continue;
            ctx.fillStyle = cell.given ? "#111111" : "#123f9a";
            ctx.font = cell.given ? "700 26px ui-sans-serif" : "650 26px ui-sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.value, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
            continue;
          }

          if (cell.given) continue;
          ctx.fillStyle = "#1e2633";
          ctx.font = "12px ui-sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const corner = [...cell.notes.corner].sort();
          if (corner.length) {
            ctx.textAlign = "left";
            ctx.fillText(corner.join(""), x0 + 4, y0 + 12);
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

    drawSelectionOutlines();
  }, [
    bgImage,
    boardH,
    boardW,
    cellPx,
    def,
    dotOffset,
    heightPx,
    linePreview,
    n,
    originX,
    originY,
    pad,
    progress,
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

  function centerHopsFromPointer(last: CellRC, clientX: number, clientY: number): CellRC[] {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return [];

    const target = { x: gp.gx - 0.5, y: gp.gy - 0.5 };
    const hops: CellRC[] = [];
    let cur = { ...last };

    for (let i = 0; i < 10; i++) {
      const dx = target.x - cur.c;
      const dy = target.y - cur.r;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.43) break;

      const stepC = Math.abs(dx) > 0.22 ? Math.sign(dx) : 0;
      const stepR = Math.abs(dy) > 0.22 ? Math.sign(dy) : 0;
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
    if (r < 0 || c < 0 || r > n || c > n) return null;
    const d = Math.hypot(gp.gx - c, gp.gy - r);
    if (d > radius) return null;
    return { r, c };
  }

  function pickNodeNeighborFromPointer(node: CellRC, clientX: number, clientY: number): CellRC | null {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return null;
    const dx = gp.gx - node.c;
    const dy = gp.gy - node.r;
    if (Math.abs(dx) < 0.06 && Math.abs(dy) < 0.06) return null;

    if (Math.abs(dx) >= Math.abs(dy)) {
      const next = { r: node.r, c: node.c + (dx < 0 ? -1 : 1) };
      if (next.c >= 0 && next.c <= n) return next;
    }

    const next = { r: node.r + (dy < 0 ? -1 : 1), c: node.c };
    if (next.r >= 0 && next.r <= n) return next;
    return null;
  }

  function pickEdgeByPointer(clientX: number, clientY: number, threshold = 0.28): { a: CellRC; b: CellRC } | null {
    const gp = eventGridPoint(clientX, clientY);
    if (!gp) return null;

    let best: { a: CellRC; b: CellRC; dist: number } | null = null;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const candidates = [
          { a: { r, c }, b: { r, c: c + 1 }, mx: c + 0.5, my: r },
          { a: { r, c }, b: { r: r + 1, c }, mx: c, my: r + 0.5 },
          { a: { r: r + 1, c }, b: { r: r + 1, c: c + 1 }, mx: c + 0.5, my: r + 1 },
          { a: { r, c: c + 1 }, b: { r: r + 1, c: c + 1 }, mx: c + 1, my: r + 0.5 },
        ];

        for (const edge of candidates) {
          if (edge.a.r < 0 || edge.a.c < 0 || edge.a.r > n || edge.a.c > n) continue;
          if (edge.b.r < 0 || edge.b.c < 0 || edge.b.r > n || edge.b.c > n) continue;
          const d = Math.hypot(gp.gx - edge.mx, gp.gy - edge.my);
          if (d > threshold) continue;
          if (!best || d < best.dist) best = { a: edge.a, b: edge.b, dist: d };
        }
      }
    }

    if (!best) return null;
    return { a: best.a, b: best.b };
  }

  function resolveInitialLineKind(point: { fx: number; fy: number }): LineKindResolved {
    if (progress.linePaletteKind === "center") return "center";
    if (progress.linePaletteKind === "edge") return "edge";

    const dCenter = Math.hypot(point.fx - 0.5, point.fy - 0.5);
    const dCorner = Math.min(
      Math.hypot(point.fx, point.fy),
      Math.hypot(1 - point.fx, point.fy),
      Math.hypot(point.fx, 1 - point.fy),
      Math.hypot(1 - point.fx, 1 - point.fy),
    );
    if (dCorner <= 0.31) return "edge";
    if (dCenter <= 0.31) return "center";
    return dCorner < dCenter ? "edge" : "center";
  }

  function onDown(e: React.PointerEvent) {
    const pt = eventPoint(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rc = { r: pt.r, c: pt.c };
    if (progress.activeTool === "line") {
      const kind = resolveInitialLineKind(pt);
      const start = kind === "edge" ? nearestCornerNode(e.clientX, e.clientY, 0.42) : nearestCellCenter(e.clientX, e.clientY) ?? rc;
      if (!start) return;
      dragRef.current = { path: [start], segments: [], last: start, moved: false, lineKind: kind, visited: new Set([rcKey(start)]) };
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
            return traceCellSteps(drag.last, next, { rows: n + 1, cols: n + 1 });
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
    const hops = centerHopsFromPointer(drag.last, e.clientX, e.clientY);
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
        if (kind === "edge") {
          const tappedEdge = pickEdgeByPointer(e.clientX, e.clientY, 0.3);
          if (tappedEdge) {
            props.onLineTapEdge(tappedEdge.a, tappedEdge.b);
          } else {
            const node = nearestCornerNode(e.clientX, e.clientY, 0.45);
            if (node) {
              const neighbor = pickNodeNeighborFromPointer(node, e.clientX, e.clientY);
              if (neighbor && Math.abs(neighbor.r - node.r) + Math.abs(neighbor.c - node.c) === 1) {
                props.onLineTapEdge(node, neighbor);
              }
            }
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
