import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CellRC, PuzzleDefinition, PuzzleProgress } from "../core/model";

type LineKindResolved = "center" | "edge";
type EdgeTrack = "top" | "bottom" | "left" | "right";
type LineSegmentDraft = { a: CellRC; b: CellRC; edgeTrack?: EdgeTrack };

type DragState = {
  path: CellRC[];
  segments: LineSegmentDraft[];
  last: CellRC;
  moved: boolean;
  lineKind?: LineKindResolved;
  visited: Set<string>;
};

function rcKey(rc: CellRC) {
  return `${rc.r},${rc.c}`;
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

    const includeLayer = (item: any) => {
      const w = Number.isFinite(item?.width) ? item.width : 1;
      const h = Number.isFinite(item?.height) ? item.height : 1;
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
      setBgImage(null);
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

    ctx.strokeStyle = "rgba(46,120,255,.85)";
    ctx.lineWidth = 2;
    for (const rc of progress.selection) {
      ctx.strokeRect(cellX(rc.c) + 1, cellY(rc.r) + 1, cellPx - 2, cellPx - 2);
    }

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

    const drawLayer = (items: NonNullable<PuzzleDefinition["cosmetics"]["underlays"]>, alpha = 0.22) => {
      for (const item of items) {
        const w = Number.isFinite(item.width) ? item.width! : 1;
        const h = Number.isFinite(item.height) ? item.height! : 1;
        const x = worldX(item.center.x - w / 2);
        const y = worldY(item.center.y - h / 2);
        const rw = w * cellPx;
        const rh = h * cellPx;

        if (item.color) {
          ctx.save();
          ctx.globalAlpha = alpha;
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
          ctx.strokeStyle = item.borderColor;
          ctx.lineWidth = item.borderThickness ?? Math.max(1.4, cellPx * 0.04);
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

    if (def.cosmetics.underlays?.length) drawLayer(def.cosmetics.underlays, 0.22);

    if (def.cosmetics.cages) {
      ctx.strokeStyle = "rgba(18,42,77,.82)";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 3]);
      for (const cage of def.cosmetics.cages) {
        const set = new Set(cage.cells.map((rc) => `${rc.r},${rc.c}`));
        ctx.fillStyle = "rgba(80,120,160,.05)";
        for (const rc of cage.cells) {
          ctx.fillRect(cellX(rc.c) + 2, cellY(rc.r) + 2, cellPx - 4, cellPx - 4);
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
        const dr = seg.b.r - seg.a.r;
        const dc = seg.b.c - seg.a.c;
        if (Math.abs(dr) + Math.abs(dc) !== 1) continue;

        if (dr === 0) {
          const row = seg.a.r;
          const minC = Math.min(seg.a.c, seg.b.c);
          const y = seg.edgeTrack === "bottom" ? cellY(row + 1) : cellY(row);
          const x0 = cellX(minC);
          const x1 = cellX(minC + 2);
          ctx.beginPath();
          ctx.moveTo(x0, y);
          ctx.lineTo(x1, y);
          ctx.stroke();
        } else {
          const col = seg.a.c;
          const minR = Math.min(seg.a.r, seg.b.r);
          const x = seg.edgeTrack === "right" ? cellX(col + 1) : cellX(col);
          const y0 = cellY(minR);
          const y1 = cellY(minR + 2);
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y1);
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    for (const stroke of progress.lines) {
      if (stroke.kind === "edge") drawEdgeStroke(stroke.segments, stroke.color);
      else drawCenterStroke(stroke.segments, stroke.color);
    }

    if (linePreview) {
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
      let x = 0;
      let y = 0;
      if (dr === 0) {
        x = cellX(Math.min(mark.a.c, mark.b.c) + 1);
        y = cellY(mark.a.r) + cellPx / 2;
      } else {
        x = cellX(mark.a.c) + cellPx / 2;
        y = cellY(Math.min(mark.a.r, mark.b.r) + 1);
      }
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

    const lit = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
    const fogDefined = (def.cosmetics.fogLights?.length ?? 0) > 0 || (def.cosmetics.fogTriggerEffects?.length ?? 0) > 0;
    if (fogDefined) {
      const lightRadius = 1;
      const addLight = (rc: CellRC) => {
        if (!inBounds(rc.r, rc.c)) return;
        for (let dr = -lightRadius; dr <= lightRadius; dr++) {
          for (let dc = -lightRadius; dc <= lightRadius; dc++) {
            const rr = rc.r + dr;
            const cc = rc.c + dc;
            if (inBounds(rr, cc)) lit[rr][cc] = true;
          }
        }
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
        const mode = (effect as any).triggerMode;
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

    if (def.cosmetics.overlays?.length) drawLayer(def.cosmetics.overlays, 0.16);

    if (fogDefined) {
      ctx.fillStyle = "rgba(84, 88, 98, .7)";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (lit[r][c]) continue;
          ctx.fillRect(cellX(c), cellY(r), cellPx, cellPx);
        }
      }
    }
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

  function pickEdgeNeighbor(rc: CellRC, fx: number, fy: number): CellRC | null {
    const dTop = fy;
    const dBottom = 1 - fy;
    const dLeft = fx;
    const dRight = 1 - fx;
    const min = Math.min(dTop, dBottom, dLeft, dRight);
    if (min > 0.26) return null;
    if (min === dTop && inBounds(rc.r - 1, rc.c)) return { r: rc.r - 1, c: rc.c };
    if (min === dBottom && inBounds(rc.r + 1, rc.c)) return { r: rc.r + 1, c: rc.c };
    if (min === dLeft && inBounds(rc.r, rc.c - 1)) return { r: rc.r, c: rc.c - 1 };
    if (min === dRight && inBounds(rc.r, rc.c + 1)) return { r: rc.r, c: rc.c + 1 };
    return null;
  }

  function resolveInitialLineKind(point: { fx: number; fy: number }): LineKindResolved {
    if (progress.linePaletteKind === "center") return "center";
    if (progress.linePaletteKind === "edge") return "edge";
    const nearEdge = Math.min(point.fx, point.fy, 1 - point.fx, 1 - point.fy) <= 0.2;
    return nearEdge ? "edge" : "center";
  }

  function nearestAllowedNeighbor(last: CellRC, clientX: number, clientY: number, orthOnly: boolean): CellRC | null {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const px = clientX - rect.left - originX;
    const py = clientY - rect.top - originY;

    let best: { rc: CellRC; d2: number } | null = null;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        if (orthOnly && Math.abs(dr) + Math.abs(dc) !== 1) continue;
        const rc = { r: last.r + dr, c: last.c + dc };
        if (!inBounds(rc.r, rc.c)) continue;
        const cx = rc.c * cellPx + cellPx / 2;
        const cy = rc.r * cellPx + cellPx / 2;
        const d2 = (px - cx) ** 2 + (py - cy) ** 2;
        if (!best || d2 < best.d2) best = { rc, d2 };
      }
    }
    if (!best) return null;
    if (best.d2 > (cellPx * 0.75) ** 2) return null;
    return best.rc;
  }

  function edgeTrackForStep(a: CellRC, b: CellRC, fx: number, fy: number): EdgeTrack {
    if (a.r === b.r) return fy < 0.5 ? "top" : "bottom";
    return fx < 0.5 ? "left" : "right";
  }

  function onDown(e: React.PointerEvent) {
    const pt = eventPoint(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rc = { r: pt.r, c: pt.c };
    if (progress.activeTool === "line") {
      const kind = resolveInitialLineKind(pt);
      dragRef.current = { path: [rc], segments: [], last: rc, moved: false, lineKind: kind, visited: new Set([rcKey(rc)]) };
      setLinePreview({ segments: [], kind });
      return;
    }

    dragRef.current = { path: [rc], segments: [], last: rc, moved: false, visited: new Set([rcKey(rc)]) };
    props.onSelection([rc]);
  }

  function onMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;

    if (progress.activeTool === "line") {
      const kind = drag.lineKind ?? "center";
      const orthOnly = kind === "edge";
      const next = nearestAllowedNeighbor(drag.last, e.clientX, e.clientY, orthOnly);
      if (!next) return;
      if (next.r === drag.last.r && next.c === drag.last.c) return;

      const prevCell = drag.path[drag.path.length - 2];
      if (prevCell && prevCell.r === next.r && prevCell.c === next.c) {
        drag.path.pop();
        drag.segments.pop();
      } else {
        const pt = eventPoint(e.clientX, e.clientY);
        const seg: LineSegmentDraft = { a: drag.last, b: next };
        if (kind === "edge" && pt) seg.edgeTrack = edgeTrackForStep(drag.last, next, pt.fx, pt.fy);
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
    drag.last = next;
    drag.moved = true;
    const key = rcKey(next);
    if (!drag.visited.has(key)) {
      drag.visited.add(key);
      drag.path.push(next);
      props.onSelection([...drag.path]);
    }
  }

  function onUp(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;

    if (progress.activeTool === "line") {
      const kind = drag.lineKind ?? "center";
      if (!drag.moved) {
        const pt = eventPoint(e.clientX, e.clientY);
        if (pt) {
          const here = { r: pt.r, c: pt.c };
          if (kind === "edge") {
            const neighbor = pickEdgeNeighbor(here, pt.fx, pt.fy);
            if (neighbor) props.onLineTapEdge(here, neighbor);
          } else {
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
