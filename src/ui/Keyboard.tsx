import React from "react";
import type { PuzzleProgress, LineStroke } from "../core/model";

const baseColors0 = ["#000000", "#ffa0a0", "#ffdf61", "#feffaf", "#b0ffb0", "#61d060", "#d0d0ff", "#8180f0", "#ff08ff"];
const baseColors1 = ["#a8a8a8", "#ffd0d0", "#ffe9a7", "#fffbd6", "#d6ffd6", "#8bf2a9", "#d9f1ff", "#bdb7ff", "#ffb3ff"];
const baseColors2 = ["#ffffff", "#ff6b6b", "#ffb703", "#fef9c3", "#57d38c", "#00c2a8", "#74c0fc", "#7c3aed", "#f72585"];

function digits(alphabetMode: boolean) {
  return alphabetMode ? ["A","B","C","D","E","F","G","H","I"] : ["1","2","3","4","5","6","7","8","9"];
}

export function Keyboard(props: {
  kind: "numbers" | "highlight" | "line";
  progress: PuzzleProgress;

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
    const keys = digits(progress.alphabetMode);
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Entry</div>
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
        </div>

        <Grid3x4>
          {keys.map((k) => (
            <Key key={k} onClick={() => props.onDigit?.(k)}>{k}</Key>
          ))}
          <Key onClick={() => props.onDigit?.("0")}>0</Key>
          <Key onClick={() => props.onToggleAlphabet?.()}>{progress.alphabetMode ? "123" : "A-I"}</Key>
          <Key onClick={() => props.onBackspace?.()}>⌫</Key>
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
          <ColorKey color="#ffffff" onClick={() => props.onWhite?.()} label="white" />
          <Key onClick={() => props.onFlipPalette?.()}>⇄</Key>
          <Key onClick={() => props.onBackspace?.()}>⌫</Key>
        </Grid3x4>
      </div>
    );
  }

  // line tool
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Line tool</div>

      <Grid3x4>
        {baseColors0.map((c) => (
          <ColorKey key={c} color={c} onClick={() => props.onColor?.(c)} />
        ))}
        <select
          style={{
            gridColumn: "1 / span 3",
            height: 52,
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(255,255,255,.05)",
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
          }}
          value={progress.linePaletteKind}
          onChange={(e) => props.onLineKind?.(e.target.value as any)}
        >
          <option value="both">center and edge</option>
          <option value="center">center only</option>
          <option value="edge">edge only</option>
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
        gridTemplateRows: "repeat(4, 52px)",
        gap: 8,
      }}
    >
      {props.children}
    </div>
  );
}

function Key(props: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <button className="btn" style={{ height: 52, ...props.style }} onClick={props.onClick}>
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
        height: 52,
        background: props.color,
        borderColor: "rgba(255,255,255,.18)",
      }}
    >
      {props.label ? <span style={{ mixBlendMode: "difference" }}>{props.label}</span> : ""}
    </button>
  );
}