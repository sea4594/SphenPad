import React, { useEffect, useRef, useState } from "react";
import type { PuzzleDefinition, PuzzleProgress, CellRC } from "../core/model";

function rcKey(rc: CellRC) { return `${rc.r},${rc.c}`; }

export function GridCanvas(props: {
  def: PuzzleDefinition;
  progress: PuzzleProgress;
  onSelection: (sel: CellRC[]) => void;
  onLineStroke: (path: CellRC[]) => void;
}) {
  const { def, progress } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const n = def.size;
  const [cellPx, setCellPx] = useState(56);
  const pad = Math.max(14, Math.round(cellPx * 0.32));
  const sizePx = pad * 2 + cellPx * n;

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);

  const normalizeBoardPoint = (x: number, y: number) => {
    // Some exports use 1-based board coordinates, others 0-based.
    const in1BasedRange = x >= 1 && x <= n + 1 && y >= 1 && y <= n + 1;
    return in1BasedRange ? { x: x - 1, y: y - 1 } : { x, y };
  };

  function inBounds(r: number, c: number) {
    return r >= 0 && c >= 0 && r < n && c < n;
  }

  const inferFogOffset = (): number => {
    const lights = def.cosmetics.fogLights;
    if (!lights?.length) return 0;
    let maxR = -Infinity;
    let maxC = -Infinity;
    let minR = Infinity;
    let minC = Infinity;
    for (const rc of lights) {
      if (rc.r > maxR) maxR = rc.r;
      if (rc.c > maxC) maxC = rc.c;
      if (rc.r < minR) minR = rc.r;
      if (rc.c < minC) minC = rc.c;
    }
    // If coordinates exceed board bounds, many puzzle exports use padded coordinates.
    if (maxR >= n || maxC >= n) {
      if (minR >= 2 || minC >= 2) return 2;
      return 1;
    }
    return 0;
  };

  const fogOffset = inferFogOffset();

  const normalizeCellForBoard = (rc: CellRC): CellRC | null => {
    if (fogOffset) {
      const m = { r: rc.r - fogOffset, c: rc.c - fogOffset };
      if (inBounds(m.r, m.c)) return m;
    }
    if (inBounds(rc.r, rc.c)) return rc;
    const m1 = { r: rc.r - 1, c: rc.c - 1 };
    if (inBounds(m1.r, m1.c)) return m1;
    const m2 = { r: rc.r - 2, c: rc.c - 2 };
    if (inBounds(m2.r, m2.c)) return m2;
    return null;
  };

  // Responsive board sizing (desktop + mobile).
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

  // Load background image
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
    const ctx = cv.getContext("2d")!;
    cv.width = sizePx * devicePixelRatio;
    cv.height = sizePx * devicePixelRatio;
    cv.style.width = `${sizePx}px`;
    cv.style.height = `${sizePx}px`;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.clearRect(0, 0, sizePx, sizePx);

    // background image if available
    if (bgImage) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(bgImage, pad, pad, cellPx * n, cellPx * n);
      ctx.globalAlpha = 1;
    }

    // background
    ctx.fillStyle = "rgba(255,255,255,.02)";
    ctx.fillRect(0, 0, sizePx, sizePx);

    const drawLayerRects = (items: NonNullable<typeof def.cosmetics.underlays>) => {
      for (const it of items) {
        const p = normalizeBoardPoint(it.center.x, it.center.y);
        const w = (it.width ?? 1) * cellPx;
        const h = (it.height ?? 1) * cellPx;
        const cx = pad + p.x * cellPx;
        const cy = pad + p.y * cellPx;
        const x = cx - w / 2;
        const y = cy - h / 2;

        ctx.save();
        if (typeof it.angle === "number" && it.angle !== 0) {
          ctx.translate(cx, cy);
          ctx.rotate((it.angle * Math.PI) / 180);
          ctx.translate(-cx, -cy);
        }

        if (it.color) {
          ctx.fillStyle = it.color;
          if (it.rounded) {
            const r = Math.min(w, h) * 0.15;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
            ctx.fill();
          } else {
            ctx.fillRect(x, y, w, h);
          }
        }

        if (it.borderColor || it.borderThickness) {
          ctx.strokeStyle = it.borderColor ?? "rgba(255,255,255,.8)";
          ctx.lineWidth = it.borderThickness ?? 1;
          if (it.rounded) {
            const r = Math.min(w, h) * 0.15;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
            ctx.stroke();
          } else {
            ctx.strokeRect(x, y, w, h);
          }
        }

        if (it.text != null && it.text !== "") {
          ctx.fillStyle = it.textColor ?? "rgba(255,255,255,.95)";
          ctx.font = `${Math.max(10, it.textSize ?? 12)}px ui-sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(it.text), cx, cy);
        }

        ctx.restore();
      }
    };

    if (def.cosmetics.underlays) drawLayerRects(def.cosmetics.underlays);

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
      ctx.strokeStyle = "rgba(255,255,255,.95)";
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 3]);
      for (const cage of def.cosmetics.cages) {
        const set = new Set(cage.cells.map((rc) => `${rc.r},${rc.c}`));

        // very subtle cage fill
        ctx.fillStyle = "rgba(255,255,255,.025)";
        for (const rc of cage.cells) {
          ctx.fillRect(pad + rc.c * cellPx + 2, pad + rc.r * cellPx + 2, cellPx - 4, cellPx - 4);

          // trace only perimeter edges so cages are actually readable
          const x = pad + rc.c * cellPx;
          const y = pad + rc.r * cellPx;
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
          ctx.fillStyle = "rgba(255,255,255,.85)";
          ctx.font = "12px ui-sans-serif";
          ctx.fillText(cage.sum, pad + first.c * cellPx + 6, pad + first.r * cellPx + 14);
        }
      }
      ctx.setLineDash([]);
    }

    // Native SudokuPad lines from `lines[].wayPoints`
    if (def.cosmetics.lines) {
      for (const ln of def.cosmetics.lines) {
        if (ln.wayPoints.length < 2) continue;
        ctx.strokeStyle = ln.color ?? "#2ecbff";
        // SudokuPad thickness values are tuned around ~50px cell size.
        ctx.lineWidth = (ln.thickness ?? 6) * (cellPx / 50);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ln.wayPoints.forEach((p, i) => {
          const x = pad + p.x * cellPx;
          const y = pad + p.y * cellPx;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
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

    // Helper function to draw path constraints (thermolines, whispers, etc.)
    const drawPathConstraint = (paths: any[], defaultColor: string, strokeWidth = 3) => {
      for (const item of paths) {
        const path = item.path;
        ctx.strokeStyle = item.color ?? defaultColor;
        ctx.lineWidth = strokeWidth;
        ctx.beginPath();
        path.forEach((rc: CellRC, i: number) => {
          const x = pad + rc.c * cellPx + cellPx / 2;
          const y = pad + rc.r * cellPx + cellPx / 2;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    };

    // Thermolines
    if (def.cosmetics.thermolines) drawPathConstraint(def.cosmetics.thermolines, "#ff6b6b", 2.5);

    // Whisper lines
    if (def.cosmetics.whispers) drawPathConstraint(def.cosmetics.whispers, "#00c2a8", 2.5);

    // Palindromes
    if (def.cosmetics.palindromes) drawPathConstraint(def.cosmetics.palindromes, "#ffa500", 2.5);

    // Renban lines
    if (def.cosmetics.renbanlines) drawPathConstraint(def.cosmetics.renbanlines, "#7c3aed", 2.5);

    // Entropic lines
    if (def.cosmetics.entropics) drawPathConstraint(def.cosmetics.entropics, "#f72585", 2.5);

    // German whispers
    if (def.cosmetics.germanwhispers) drawPathConstraint(def.cosmetics.germanwhispers, "#00d4ff", 2.5);

    // Modular lines
    if (def.cosmetics.modularlines) drawPathConstraint(def.cosmetics.modularlines, "#ffb703", 2.5);

    // Irregular regions with subtle borders
    if (def.cosmetics.irregularRegions) {
      for (const region of def.cosmetics.irregularRegions) {
        ctx.fillStyle = region.color ?? "rgba(255,255,255,.08)";
        for (const rc of region.cells) {
          ctx.fillRect(pad + rc.c * cellPx + 1, pad + rc.r * cellPx + 1, cellPx - 2, cellPx - 2);
        }
      }
    }

    // Disjoint groups (similar rendering to irregular regions)
    if (def.cosmetics.disjointGroups) {
      for (const group of def.cosmetics.disjointGroups) {
        ctx.fillStyle = group.color ?? "rgba(200,200,200,.06)";
        for (const rc of group.cells) {
          ctx.fillRect(pad + rc.c * cellPx + 1, pad + rc.r * cellPx + 1, cellPx - 2, cellPx - 2);
        }
      }
    }

    // Little killer clues
    if (def.cosmetics.littlekillers) {
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "11px ui-sans-serif";
      for (const lk of def.cosmetics.littlekillers) {
        const x = pad + lk.rc.c * cellPx;
        const y = pad + lk.rc.r * cellPx;
        // Position based on direction (top-left, top-right, bottom-left, bottom-right)
        let tx = x, ty = y;
        if (lk.direction === "tl") { tx = x + 2; ty = y + 12; }
        else if (lk.direction === "tr") { tx = x + cellPx - 2; ty = y + 12; ctx.textAlign = "right"; }
        else if (lk.direction === "bl") { tx = x + 2; ty = y + cellPx - 2; }
        else if (lk.direction === "br") { tx = x + cellPx - 2; ty = y + cellPx - 2; ctx.textAlign = "right"; }
        ctx.fillText(lk.value, tx, ty);
        ctx.textAlign = "center";
      }
    }

    // Grid clues (skyscraper, sandwich, x-sum)
    const drawGridClues = (clues: any, offset: number, side: "top" | "bottom" | "left" | "right") => {
      if (!clues) return;
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "11px ui-sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      const clueArray = clues[side.toLowerCase()] as string[] | undefined;
      if (!clueArray) return;

      for (let i = 0; i < clueArray.length && i < 9; i++) {
        const clue = clueArray[i];
        if (!clue) continue;
        let x, y;
        if (side === "top") { x = pad + (i + 0.5) * cellPx; y = offset / 2; }
        else if (side === "bottom") { x = pad + (i + 0.5) * cellPx; y = pad + n * cellPx + offset / 2; }
        else if (side === "left") { x = offset / 2; y = pad + (i + 0.5) * cellPx; }
        else { x = pad + n * cellPx + offset / 2; y = pad + (i + 0.5) * cellPx; }
        ctx.fillText(clue, x, y);
      }
    };

    // Draw clues (would require more space, so just draw if available)
    const clueOffset = 30;
    if (def.cosmetics.skyscraper) {
      drawGridClues(def.cosmetics.skyscraper, clueOffset, "top");
      drawGridClues(def.cosmetics.skyscraper, clueOffset, "bottom");
      drawGridClues(def.cosmetics.skyscraper, clueOffset, "left");
      drawGridClues(def.cosmetics.skyscraper, clueOffset, "right");
    }
    if (def.cosmetics.sandwich) {
      drawGridClues(def.cosmetics.sandwich, clueOffset, "top");
      drawGridClues(def.cosmetics.sandwich, clueOffset, "bottom");
      drawGridClues(def.cosmetics.sandwich, clueOffset, "left");
      drawGridClues(def.cosmetics.sandwich, clueOffset, "right");
    }
    if (def.cosmetics.xsum) {
      drawGridClues(def.cosmetics.xsum, clueOffset, "top");
      drawGridClues(def.cosmetics.xsum, clueOffset, "bottom");
      drawGridClues(def.cosmetics.xsum, clueOffset, "left");
      drawGridClues(def.cosmetics.xsum, clueOffset, "right");
    }

    if (def.cosmetics.overlays) drawLayerRects(def.cosmetics.overlays);

    // Fog overlay (best-effort): reveal seed lights and correct entries' neighborhoods.
    if (def.cosmetics.fogLights && def.cosmetics.fogLights.length) {
      const visible = new Set(
        def.cosmetics.fogLights
          .map(normalizeCellForBoard)
          .filter((x): x is CellRC => x !== null)
          .map((rc) => rcKey(rc))
      );

      const solution = def.cosmetics.solution;
      if (solution && solution.length >= n * n) {
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            const idx = r * n + c;
            const cell = progress.cells[r][c];
            if (!cell.value) continue;
            if (cell.value !== solution[idx]) continue;

            // reveal around correctly filled cells to mimic fog expansion
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const rr = r + dr;
                const cc = c + dc;
                if (!inBounds(rr, cc)) continue;
                visible.add(`${rr},${cc}`);
              }
            }
          }
        }
      }

      if (def.cosmetics.fogTriggerEffects && def.cosmetics.fogTriggerEffects.length) {
        for (const te of def.cosmetics.fogTriggerEffects) {
          const triggered = te.triggerCells.some((rc) => {
            const m = normalizeCellForBoard(rc);
            if (!m) return false;
            const v = progress.cells[m.r][m.c].value;
            return Boolean(v);
          });
          if (!triggered) continue;
          for (const rc of te.revealCells) {
            const m = normalizeCellForBoard(rc);
            if (!m) continue;
            visible.add(`${m.r},${m.c}`);
          }
        }
      }

      ctx.fillStyle = "rgba(0,0,0,0.82)";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (visible.has(`${r},${c}`)) continue;
          ctx.fillRect(pad + c * cellPx, pad + r * cellPx, cellPx, cellPx);
        }
      }
    }

    // user lines
    for (const stroke of progress.lines) {
      for (const seg of stroke.segments) {
        const ax = pad + seg.a.c * cellPx + cellPx / 2;
        const ay = pad + seg.a.r * cellPx + cellPx / 2;
        const bx = pad + seg.b.c * cellPx + cellPx / 2;
        const by = pad + seg.b.r * cellPx + cellPx / 2;
        const dx = bx - ax;
        const dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        const edgeInset = cellPx * 0.3;

        const drawCore = () => {
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        };

        const drawEdge = () => {
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(ax + nx * edgeInset, ay + ny * edgeInset);
          ctx.lineTo(bx - nx * edgeInset, by - ny * edgeInset);
          ctx.stroke();
        };

        if (stroke.kind === "center") drawCore();
        else if (stroke.kind === "edge") drawEdge();
        else {
          ctx.globalAlpha = 0.55;
          drawEdge();
          ctx.globalAlpha = 1;
          drawCore();
        }
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
  }, [def, progress, sizePx, n, bgImage]);

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

  const drag = useRef<{ start: CellRC; last: CellRC; path: CellRC[]; seen: Set<string> } | null>(null);

  function isNeighbor(a: CellRC, b: CellRC) {
    const dr = Math.abs(a.r - b.r);
    const dc = Math.abs(a.c - b.c);
    return dr <= 1 && dc <= 1 && (dr + dc > 0);
  }

  function onDown(e: React.PointerEvent) {
    const rc = hitRC(e.clientX, e.clientY);
    if (!rc) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    drag.current = { start: rc, last: rc, path: [rc], seen: new Set([rcKey(rc)]) };

    if (progress.activeTool === "line") {
      props.onSelection([rc]);
      return;
    }

    props.onSelection([rc]);
  }

  function onMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const rc = hitRC(e.clientX, e.clientY);
    if (!rc) return;

    const state = drag.current;
    if (state.last.r === rc.r && state.last.c === rc.c) return;

    if (progress.activeTool === "line") {
      if (!isNeighbor(state.last, rc)) {
        return;
      }
      state.path.push(rc);
      state.last = rc;
      props.onSelection([rc]);
      return;
    }

    state.last = rc;
    const key = rcKey(rc);
    if (!state.seen.has(key)) {
      state.seen.add(key);
      state.path.push(rc);
    }

    props.onSelection([...state.path]);

  }

  function onUp() {
    if (!drag.current) return;

    const state = drag.current;
    if (progress.activeTool === "line" && state.path.length >= 2) {
      props.onLineStroke(state.path);
    }

    drag.current = null;
  }

  function onCancel() {
    drag.current = null;
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
        Drag to select visited cells. In line mode, drag cell-to-cell to draw continuous paths.
      </div>
    </div>
  );
}