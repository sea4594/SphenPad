import React, { useEffect, useMemo, useRef, useState } from "react";
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
  visited: Set<string>;
  selectionSet?: Set<string>;
  selectionMode?: "replace" | "add" | "remove";
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
  onLineStroke: (segments: LineSegmentDraft[], kind: LineKindResolved) => void;
  onLineTapCell: (rc: CellRC) => void;
  onLineTapEdge: (a: CellRC, b: CellRC) => void;
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
      const w = Number.isFinite(item?.width) ? Number(item.width) : 1;
      const h = Number.isFinite(item?.height) ? Number(item.height) : 1;
      includePoint(item?.center?.x - w / 2, item?.center?.y - h / 2);
      includePoint(item?.center?.x + w / 2, item?.center?.y + h / 2);
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

  const worldX = (x: number) => originX + x * cellPx;
  const worldY = (y: number) => originY + y * cellPx;
  const cellX = (c: number) => originX + c * cellPx;
  const cellY = (r: number) => originY + r * cellPx;

  const dotOffset = useMemo(() => {
    const dots = def.cosmetics.dots ?? [];
    const maxCoord = dots.reduce((acc, d) => Math.max(acc, d.a.r, d.a.c, d.b.r, d.b.c), -Infinity);
    return maxCoord >= n ? 1 : 0;
  }, [def.cosmetics.dots, n]);

  function inBounds(r: number, c: number) {
    return r >= 0 && c >= 0 && r < n && c < n;
  }

  function normalizeDotRc(rc: CellRC): CellRC | null {
    const shifted = dotOffset ? { r: rc.r - dotOffset, c: rc.c - dotOffset } : rc;
    if (inBounds(shifted.r, shifted.c)) return shifted;
    if (inBounds(rc.r, rc.c)) return rc;
    return null;
  }

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
      const width = el.clientWidth || window.innerWidth;
      const available = Math.max(280, width - 28);
      const next = Math.floor(Math.min(56, Math.max(34, available / n)));
      setCellPx(next);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, [n]);

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

    ctx.fillStyle = "rgba(255,255,255,.02)";
    ctx.fillRect(0, 0, widthPx, heightPx);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const col = progress.cells[r][c].color;
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(cellX(c), cellY(r), cellPx, cellPx);
        ctx.globalAlpha = 1;
      }
    }

    const drawSelectionOutlines = () => {
      if (!progress.selection.length) return;
      const selected = new Set(progress.selection.map(rcKey));
      const inset = 1;
      ctx.save();
      ctx.strokeStyle = "rgba(46,120,255,.95)";
      ctx.lineWidth = 2.4;
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

    for (let i = 0; i <= n; i++) {
      ctx.lineWidth = i % subgrid.r === 0 ? 2.5 : 1;
      ctx.strokeStyle = "rgba(28,46,74,.62)";
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

    const drawLayer = (items: NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>) => {
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

        if (item.color) {
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

        if (item.borderColor) {
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

        if (item.text != null && String(item.text).length) {
          ctx.save();
          if (angleRad) {
            ctx.translate(cx, cy);
            ctx.rotate(angleRad);
            ctx.translate(-cx, -cy);
          }
          ctx.fillStyle = item.textColor ?? "rgba(20,47,88,.92)";
          const px = (item.textSize ?? 16) * (cellPx / 56);
          ctx.font = `700 ${Math.max(10, px)}px ui-sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(item.text), worldX(item.center.x), worldY(item.center.y));
          ctx.restore();
        }
      }
    };

    if (def.cosmetics.underlays?.length) drawLayer(def.cosmetics.underlays);

    if (def.cosmetics.cages) {
      ctx.strokeStyle = "rgba(18,42,77,.82)";
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
          ctx.fillStyle = "rgba(12, 30, 55, .8)";
          ctx.font = "12px ui-sans-serif";
          ctx.fillText(cage.sum, cellX(first.c) + 6, cellY(first.r) + 14);
        }
      }
      ctx.setLineDash([]);
    }

    if (def.cosmetics.lines) {
      for (const ln of def.cosmetics.lines) {
        if (ln.wayPoints.length < 2) continue;
        ctx.strokeStyle = ln.color ?? "#2ecbff";
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
      ctx.strokeStyle = "rgba(20,47,88,.9)";
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
        ctx.fillStyle = "rgba(20,47,88,.95)";
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
        ctx.strokeStyle = "rgba(20,47,88,.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

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
          ctx.fillStyle = cell.given ? "rgba(20,47,88,.95)" : "rgba(46,120,255,.95)";
          ctx.font = cell.given ? "700 26px ui-sans-serif" : "650 26px ui-sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(cell.value, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
        } else {
          ctx.fillStyle = "rgba(20,47,88,.72)";
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

    if (def.cosmetics.overlays?.length) drawLayer(def.cosmetics.overlays);

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
          const col = progress.cells[r][c].color;
          if (!col) continue;
          ctx.fillStyle = lit[r][c] ? col : darkenColor(col, 0.3);
          ctx.globalAlpha = lit[r][c] ? 0.25 : 0.3;
          ctx.fillRect(cellX(c), cellY(r), cellPx, cellPx);
          ctx.globalAlpha = 1;
        }
      }

      // Keep grid visible on top of fog.
      for (let i = 0; i <= n; i++) {
        ctx.lineWidth = i % subgrid.r === 0 ? 2.5 : 1;
        ctx.strokeStyle = "rgba(28,46,74,.7)";
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
            ctx.fillStyle = cell.given ? "rgba(20,47,88,.95)" : "rgba(46,120,255,.95)";
            ctx.font = cell.given ? "700 26px ui-sans-serif" : "650 26px ui-sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.value, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
            continue;
          }

          if (cell.given) continue;
          ctx.fillStyle = "rgba(20,47,88,.78)";
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
      const start = kind === "edge" ? nearestCornerNode(e.clientX, e.clientY, 0.42) : rc;
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
      if (!(touchedSelected && progress.selection.length === 1)) {
        nextSelection.add(key);
      }
      dragRef.current = {
        path: [rc],
        segments: [],
        last: rc,
        moved: false,
        visited: new Set([key]),
        selectionSet: nextSelection,
        selectionMode: "replace",
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
      const pt = eventPoint(e.clientX, e.clientY);
      const prevCell = drag.path[drag.path.length - 2] ?? null;
      const next = kind === "edge"
        ? nearestCornerNode(e.clientX, e.clientY, 0.42)
        : (pt ? { r: pt.r, c: pt.c } : null);
      if (!next) return;
      if (next.r === drag.last.r && next.c === drag.last.c) return;

      const dr = next.r - drag.last.r;
      const dc = next.c - drag.last.c;
      if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return;
      if (kind === "edge" && Math.abs(dr) + Math.abs(dc) !== 1) return;

      if (prevCell && prevCell.r === next.r && prevCell.c === next.c) {
        drag.path.pop();
        drag.segments.pop();
      } else {
        const seg: LineSegmentDraft = { a: drag.last, b: next };
        drag.path.push(next);
        drag.segments.push(seg);
      }
      drag.last = next;
      drag.moved = true;
      setLinePreview({ segments: [...drag.segments], kind });
      return;
    }

    const pt = eventPoint(e.clientX, e.clientY);
    if (!pt) return;
    const next = { r: pt.r, c: pt.c };
    if (next.r === drag.last.r && next.c === drag.last.c) return;
    if (Math.abs(next.r - drag.last.r) > 1 || Math.abs(next.c - drag.last.c) > 1) return;
    drag.last = next;
    drag.moved = true;
    const key = rcKey(next);
    if (drag.visited.has(key)) return;
    drag.visited.add(key);
    drag.path.push(next);

    const nextSelection = drag.selectionSet ? new Set(drag.selectionSet) : new Set<string>();
    if (drag.selectionMode === "remove") nextSelection.delete(key);
    else nextSelection.add(key);
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
          const node = nearestCornerNode(e.clientX, e.clientY, 0.45);
          if (node) {
            const neighbor = pickNodeNeighborFromPointer(node, e.clientX, e.clientY);
            if (neighbor && Math.abs(neighbor.r - node.r) + Math.abs(neighbor.c - node.c) === 1) {
              props.onLineTapEdge(node, neighbor);
            }
          }
        } else {
          const pt = eventPoint(e.clientX, e.clientY);
          if (pt) {
            const here = { r: pt.r, c: pt.c };
            props.onLineTapCell(here);
          }
        }
      } else if (drag.segments.length > 0) {
        props.onLineStroke(drag.segments, kind);
      }
      setLinePreview(null);
    }

    dragRef.current = null;
  }

  function onCancel() {
    dragRef.current = null;
    setLinePreview(null);
  }

  return (
    <div ref={wrapRef} className="card boardCard" style={{ display: "grid", placeItems: "center", width: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ maxWidth: "100%", touchAction: "none", userSelect: "none" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onPointerLeave={onCancel}
      />
      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
        Drag across cells to select. In line mode, drag to draw, backtrack to erase path, tap for marks.
      </div>
    </div>
  );
}
