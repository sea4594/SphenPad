import React from "react";
import type { PuzzleProgress, LineStroke } from "../core/model";

const baseColors0 = ["#d9d9d9", "#9b9b9b", "#4f4f4f", "#57d38c", "#ff8fc3", "#ffae57", "#ff5f57", "#ffe066", "#63a6ff"];
const baseColors1 = ["#000000", "#ffa0a0", "#ffdf61", "#feffaf", "#b0ffb0", "#61d060", "#d0d0ff", "#8180f0", "#ff08ff"];
const baseColors2 = ["#a8a8a8", "#ffd0d0", "#ffe9a7", "#fffbd6", "#d6ffd6", "#8bf2a9", "#d9f1ff", "#bdb7ff", "#ffb3ff"];
const lineColors = ["#000000", "#ff4d4f", "#ff9f1a", "#ffd60a", "#34c759", "#00b894", "#32ade6", "#4f46e5", "#ff2d96"];

function digits(alphabetMode: boolean, size: number) {
  const n = Math.max(1, Math.min(16, size));
  return Array.from({ length: n }, (_, i) =>
    alphabetMode ? String.fromCharCode(65 + i) : String(i + 1)
  );
}

export function Keyboard(props: {
  kind: "numbers" | "highlight" | "line";
  progress: PuzzleProgress;
  title?: string;
  hideEntryModeButtons?: boolean;

  onDigit?: (d: string) => void;
  onBackspace?: () => void;
  onToggleAlphabet?: () => void;
  onMode?: (m: PuzzleProgress["entryMode"]) => void;

  onColor?: (c: string) => void;
  onWhite?: () => void;
  onFlipPalette?: () => void;

  onLineKind?: (k: LineStroke["kind"]) => void;
}) {
  const { kind, progress } = props;

  if (kind === "numbers") {
    const keys = digits(progress.alphabetMode, progress.cells.length);
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>{props.title ?? "Entry"}</div>
          {!props.hideEntryModeButtons ? (
            <div className="row">
              {(["value","center","corner","candidates"] as const).map((m) => (
                <button
                  key={m}
                  className={"btn" + (progress.entryMode === m ? " primary" : "")}
                  onClick={() => props.onMode?.(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Grid3x4>
          {keys.map((k) => (
            <Key key={k} onClick={() => props.onDigit?.(k)}>{k}</Key>
          ))}
          <Key onClick={() => props.onDigit?.("0")}>0</Key>
          <Key onClick={() => props.onToggleAlphabet?.()}>{progress.alphabetMode ? "123" : "A-I"}</Key>
          <Key onClick={() => props.onBackspace?.()} title="Backspace">⌫</Key>
        </Grid3x4>
      </div>
    );
  }

  if (kind === "highlight") {
    const palette = progress.highlightPalettePage === 0 ? baseColors0 : progress.highlightPalettePage === 1 ? baseColors1 : baseColors2;
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Highlight</div>
          <div className="muted">page {progress.highlightPalettePage + 1}/3</div>
        </div>

        <Grid3x4>
          {palette.map((c) => (
            <ColorKey key={c} color={c} onClick={() => props.onColor?.(c)} />
          ))}
          <ColorKey color="#ffffff" onClick={() => props.onWhite?.()} />
          <Key onClick={() => props.onFlipPalette?.()}>⇄</Key>
          <Key onClick={() => props.onBackspace?.()} title="Backspace">⌫</Key>
        </Grid3x4>
      </div>
    );
  }

  // line tool
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Line tool</div>

      <Grid3x4>
        {lineColors.map((c) => (
          <ColorKey key={c} color={c} onClick={() => props.onColor?.(c)} />
        ))}
        <Key onClick={() => props.onBackspace?.()} title="Backspace">⌫</Key>
        <div />
        <select
          style={{
            gridColumn: "1 / span 3",
            height: "clamp(44px, 10vw, 52px)",
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.05)",
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
          }}
          value={progress.linePaletteKind}
          onChange={(e) => props.onLineKind?.(e.target.value as LineStroke["kind"])}
        >
          <option value="both">centers and edges (default)</option>
          <option value="center">centers only</option>
          <option value="edge">edges only</option>
        </select>
      </Grid3x4>
    </div>
  );
}

function Grid3x4(props: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 10,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(4, minmax(44px, 52px))",
        gap: 8,
      }}
    >
      {props.children}
    </div>
  );
}

function Key(props: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties; title?: string }) {
  return (
    <button className="btn" style={{ height: "clamp(44px, 10vw, 52px)", ...props.style }} onClick={props.onClick} title={props.title}>
      {props.children}
    </button>
  );
}

function ColorKey(props: { color: string; onClick?: () => void; label?: string }) {
  return (
    <button
      className="btn"
      onClick={props.onClick}
      title={props.label ?? props.color}
      style={{
        height: "clamp(44px, 10vw, 52px)",
        background: props.color,
        borderColor: "rgba(255,255,255,.18)",
      }}
    >
      {props.label ? <span style={{ mixBlendMode: "difference" }}>{props.label}</span> : ""}
    </button>
  );
}