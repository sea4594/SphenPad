import React, { useEffect, useMemo, useRef } from "react";
import type { PuzzleDefinition, PuzzleProgress, CellRC } from "../core/model";

function rcKey(rc: CellRC) { return `${rc.r},${rc.c}`; }

export function GridCanvas(props: {
  def: PuzzleDefinition;
  progress: PuzzleProgress;
  onSelection: (sel: CellRC[]) => void;
  onLineSegment: (a: CellRC, b: CellRC) => void;
}) {
  const { def, progress } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const n = def.size;
  const cellPx = 56;
  const pad = 18;
  const sizePx = pad * 2 + cellPx * n;

  const selectionSet = useMemo(() => new Set(progress.selection.map(rcKey)), [progress.selection]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    cv.width = sizePx * devicePixelRatio;
    cv.height = sizePx * devicePixelRatio;
    cv.style.width = `${sizePx}px`;
    cv.style.height = `${sizePx}px`;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.clearRect(0, 0, sizePx, sizePx);

    // background
    ctx.fillStyle = "rgba(255,255,255,.02)";
    ctx.fillRect(0, 0, sizePx, sizePx);

    // highlights
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const col = progress.cells[r][c].color;
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(pad + c * cellPx, pad + r * cellPx, cellPx, cellPx);
      ctx.globalAlpha = 1;
    }

    // selection
    ctx.strokeStyle = "rgba(122,162,255,.9)";
    ctx.lineWidth = 2;
    for (const rc of progress.selection) {
      ctx.strokeRect(pad + rc.c * cellPx + 1, pad + rc.r * cellPx + 1, cellPx - 2, cellPx - 2);
    }

    // grid
    for (let i = 0; i <= n; i++) {
      const w = (i % 3 === 0) ? 2.5 : 1;
      ctx.lineWidth = w;
      ctx.strokeStyle = "rgba(255,255,255,.65)";
      ctx.beginPath();
      ctx.moveTo(pad, pad + i * cellPx);
      ctx.lineTo(pad + n * cellPx, pad + i * cellPx);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad + i * cellPx, pad);
      ctx.lineTo(pad + i * cellPx, pad + n * cellPx);
      ctx.stroke();
    }

    // cages (outline)
    if (def.cosmetics.cages) {
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 2;
      for (const cage of def.cosmetics.cages) {
        // MVP: draw a faint fill for cage cells; proper cage border tracing is a later step.
        ctx.fillStyle = "rgba(255,255,255,.04)";
        for (const rc of cage.cells) {
          ctx.fillRect(pad + rc.c * cellPx + 2, pad + rc.r * cellPx + 2, cellPx - 4, cellPx - 4);
        }
        if (cage.sum) {
          const first = cage.cells[0];
          ctx.fillStyle = "rgba(255,255,255,.85)";
          ctx.font = "12px ui-sans-serif";
          ctx.fillText(cage.sum, pad + first.c * cellPx + 6, pad + first.r * cellPx + 14);
        }
      }
    }

    // arrows (simple polyline)
    if (def.cosmetics.arrows) {
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 3;
      for (const a of def.cosmetics.arrows) {
        ctx.beginPath();
        a.path.forEach((rc, i) => {
          const x = pad + rc.c * cellPx + cellPx / 2;
          const y = pad + rc.r * cellPx + cellPx / 2;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // bulb
        const b = a.bulb;
        ctx.fillStyle = "rgba(255,255,255,.95)";
        ctx.beginPath();
        ctx.arc(pad + b.c * cellPx + cellPx / 2, pad + b.r * cellPx + cellPx / 2, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // dots
    if (def.cosmetics.dots) {
      for (const d of def.cosmetics.dots) {
        const ax = pad + d.a.c * cellPx + cellPx / 2;
        const ay = pad + d.a.r * cellPx + cellPx / 2;
        const bx = pad + d.b.c * cellPx + cellPx / 2;
        const by = pad + d.b.r * cellPx + cellPx / 2;
        const x = (ax + bx) / 2;
        const y = (ay + by) / 2;

        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = d.kind === "white" ? "rgba(255,255,255,.95)" : "rgba(0,0,0,.95)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.85)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // user lines
    for (const stroke of progress.lines) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = 4;
      for (const seg of stroke.segments) {
        const ax = pad + seg.a.c * cellPx + cellPx / 2;
        const ay = pad + seg.a.r * cellPx + cellPx / 2;
        const bx = pad + seg.b.c * cellPx + cellPx / 2;
        const by = pad + seg.b.r * cellPx + cellPx / 2;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // digits + notes
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const cell = progress.cells[r][c];
      const x0 = pad + c * cellPx;
      const y0 = pad + r * cellPx;

      if (cell.value) {
        ctx.fillStyle = cell.given ? "rgba(255,255,255,.95)" : "rgba(122,162,255,.95)";
        ctx.font = cell.given ? "700 26px ui-sans-serif" : "650 26px ui-sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cell.value, x0 + cellPx / 2, y0 + cellPx / 2 + 1);
      } else {
        ctx.fillStyle = "rgba(255,255,255,.72)";
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

        // candidates: distribute 3×3
        const cand = new Set(cell.notes.candidates);
        if (cand.size) {
          ctx.font = "10px ui-sans-serif";
          ctx.textAlign = "center";
          const sym = Array.from(cand).sort();
          for (const s of sym) {
            const idx = (Number.isFinite(Number(s)) ? Number(s) : (s.charCodeAt(0) - 64));
            if (!idx) continue;
            const rr = Math.floor((idx - 1) / 3);
            const cc = (idx - 1) % 3;
            ctx.fillText(
              s,
              x0 + (cc + 0.5) * (cellPx / 3),
              y0 + (rr + 0.5) * (cellPx / 3)
            );
          }
        }
      }

      // subtle given lock
      if (cell.given) {
        ctx.fillStyle = "rgba(255,255,255,.04)";
        ctx.fillRect(x0 + 2, y0 + 2, cellPx - 4, cellPx - 4);
      }

      // selection overlay already handled
    }
  }, [def, progress, selectionSet, sizePx, n]);

  // pointer interactions
  function hitRC(clientX: number, clientY: number): CellRC | null {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = clientX - rect.left - pad;
    const y = clientY - rect.top - pad;
    const c = Math.floor(x / cellPx);
    const r = Math.floor(y / cellPx);
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    return { r, c };
  }

  const drag = useRef<{ start: CellRC; last: CellRC } | null>(null);

  function onDown(e: React.PointerEvent) {
    const rc = hitRC(e.clientX, e.clientY);
    if (!rc) return;

    (e.currentTarget as any).setPointerCapture(e.pointerId);

    drag.current = { start: rc, last: rc };

    if (progress.multiSelect) {
      // toggle cell in selection
      const key = rcKey(rc);
      const next = selectionSet.has(key)
        ? progress.selection.filter((x) => rcKey(x) !== key)
        : [...progress.selection, rc];
      props.onSelection(next.length ? next : [rc]);
    } else {
      props.onSelection([rc]);
    }
  }

  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rc = hitRC(e.clientX, e.clientY);
    if (!rc) return;

    // drag-to-select rectangle (single-select mode only)
    if (!progress.multiSelect) {
      const a = drag.current.start;
      const r0 = Math.min(a.r, rc.r), r1 = Math.max(a.r, rc.r);
      const c0 = Math.min(a.c, rc.c), c1 = Math.max(a.c, rc.c);
      const sel: CellRC[] = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) sel.push({ r, c });
      props.onSelection(sel);
    }

    drag.current.last = rc;
  }

  function onUp() {
    if (!drag.current) return;

    // If line tool is active (heuristic): when line kind is set and user double-clicks later you can refine.
    // MVP: if SHIFT-like behavior desired, add a UI toggle; for now, draw a segment between last two visited cells when dragging ends.
    const { start, last } = drag.current;
    if (start.r !== last.r || start.c !== last.c) {
      props.onLineSegment(start, last);
    }

    drag.current = null;
  }

  return (
    <div className="card" style={{ display: "grid", placeItems: "center" }}>
      <canvas ref={canvasRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
        Tap/drag to select. Drag across cells to add a single line segment (MVP).
      </div>
    </div>
  );
}