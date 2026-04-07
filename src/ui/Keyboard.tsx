import React from "react";
import type { PuzzleProgress, LineStroke } from "../core/model";

const baseColors0 = ["#d9d9d9", "#9b9b9b", "#4f4f4f", "#57d38c", "#ff8fc3", "#ffae57", "#ff5f57", "#ffe066", "#63a6ff"];
const baseColors1 = ["#000000", "#ffa0a0", "#ffdf61", "#feffaf", "#b0ffb0", "#61d060", "#d0d0ff", "#8180f0", "#ff08ff"];
const baseColors2 = ["#a8a8a8", "#ffd0d0", "#ffe9a7", "#fffbd6", "#d6ffd6", "#8bf2a9", "#d9f1ff", "#bdb7ff", "#ffb3ff"];
const lineColors = ["#000000", "#ff4d4f", "#ff9f1a", "#ffd60a", "#34c759", "#00b894", "#32ade6", "#4f46e5", "#ff2d96"];

const alphabetPages: ReadonlyArray<ReadonlyArray<string>> = [
  ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
  ["J", "K", "L", "M", "N", "O", "P", "Q", "R"],
  ["S", "T", "U", "V", "W", "X", "Y", "Z", "*"],
];

const alphabetPageLabels = ["A-I", "J-R", "S-Z*"] as const;

function digits(alphabetMode: boolean, alphabetPage: 0 | 1 | 2) {
  if (alphabetMode) return alphabetPages[alphabetPage] ?? alphabetPages[0];
  return Array.from({ length: 9 }, (_, i) => String(i + 1));
}

export function Keyboard(props: {
  kind: "numbers" | "highlight" | "line";
  progress: PuzzleProgress;
  title?: string;
  hideEntryModeButtons?: boolean;
  compact?: boolean;

  onDigit?: (d: string) => void;
  onBackspace?: () => void;
  onToggleAlphabet?: () => void;
  onCycleAlphabetPage?: () => void;
  onMode?: (m: PuzzleProgress["entryMode"]) => void;

  onColor?: (c: string) => void;
  onWhite?: () => void;
  onFlipPalette?: () => void;

  onLineKind?: (k: LineStroke["kind"]) => void;
}) {
  const { kind, progress } = props;
  const compact = Boolean(props.compact);

  if (kind === "numbers") {
    const keys = digits(progress.alphabetMode, progress.alphabetPage ?? 0);
    const pageLabel = alphabetPageLabels[progress.alphabetPage ?? 0] ?? alphabetPageLabels[0];
    const grid = (
      <Grid3x4 compact={compact}>
        {keys.map((k) => (
          <Key key={k} onClick={() => props.onDigit?.(k)}>{k}</Key>
        ))}
        {progress.alphabetMode ? (
          <Key onClick={() => props.onCycleAlphabetPage?.()} title="Cycle letter page">{pageLabel}</Key>
        ) : (
          <Key onClick={() => props.onDigit?.("0")}>0</Key>
        )}
        <Key onClick={() => props.onToggleAlphabet?.()}>{progress.alphabetMode ? "123" : "A-I"}</Key>
        <Key onClick={() => props.onBackspace?.()} title="Backspace">⌫</Key>
      </Grid3x4>
    );

    if (compact) return grid;

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

        {grid}
      </div>
    );
  }

  if (kind === "highlight") {
    const palette = progress.highlightPalettePage === 0 ? baseColors0 : progress.highlightPalettePage === 1 ? baseColors1 : baseColors2;
    const grid = (
      <Grid3x4 compact={compact}>
        {palette.map((c) => (
          <ColorKey key={c} color={c} onClick={() => props.onColor?.(c)} />
        ))}
        <ColorKey color="#ffffff" onClick={() => props.onWhite?.()} />
        <Key onClick={() => props.onFlipPalette?.()}>⇄</Key>
        <Key onClick={() => props.onBackspace?.()} title="Backspace">⌫</Key>
      </Grid3x4>
    );

    if (compact) return grid;

    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Highlight</div>
          <div className="muted">page {progress.highlightPalettePage + 1}/3</div>
        </div>

        {grid}
      </div>
    );
  }

  const lineKindLabel = progress.linePaletteKind === "both"
    ? "B"
    : progress.linePaletteKind === "center"
      ? "C"
      : "E";
  const lineGrid = (
    <Grid3x4 compact={compact}>
      {lineColors.map((c) => (
        <ColorKey key={c} color={c} onClick={() => props.onColor?.(c)} />
      ))}
      <ColorKey color="#ffffff" onClick={() => props.onColor?.("#ffffff")} />
      <Key onClick={() => props.onLineKind?.(progress.linePaletteKind === "both" ? "center" : progress.linePaletteKind === "center" ? "edge" : "both")} title="Cycle line mode">
        {lineKindLabel}
      </Key>
      <Key onClick={() => props.onBackspace?.()} title="Backspace">⌫</Key>
    </Grid3x4>
  );

  if (compact) return lineGrid;

  // line tool
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Line tool</div>
      {lineGrid}
    </div>
  );
}

function Grid3x4(props: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div
      className={"keyGrid" + (props.compact ? " compact" : "")}
      style={{
        marginTop: props.compact ? 0 : 10,
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: props.compact ? "repeat(4, minmax(0, 1fr))" : "repeat(4, minmax(44px, 52px))",
        gap: props.compact ? 4 : 8,
      }}
    >
      {props.children}
    </div>
  );
}

function Key(props: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties; title?: string }) {
  return (
    <button className="btn keyButton" style={{ height: "100%", ...props.style }} onClick={props.onClick} title={props.title}>
      {props.children}
    </button>
  );
}

function ColorKey(props: { color: string; onClick?: () => void; label?: string }) {
  return (
    <button
      className="btn keyButton"
      onClick={props.onClick}
      title={props.label ?? props.color}
      style={{
        height: "100%",
        background: props.color,
        borderColor: "rgba(255,255,255,.18)",
      }}
    >
      {props.label ? <span style={{ mixBlendMode: "difference" }}>{props.label}</span> : ""}
    </button>
  );
}