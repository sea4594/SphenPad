import React from "react";
import type { PuzzleProgress } from "../core/model";
import { IconBackspace, IconCycle } from "./icons";
import { highlightPalettePages, linePalette } from "./toolPalettes";

const alphabetPages: ReadonlyArray<ReadonlyArray<string>> = [
  ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
  ["J", "K", "L", "M", "N", "O", "P", "Q", "R"],
  ["S", "T", "U", "V", "W", "X", "Y", "Z", "*"],
];

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

  onToggleDoubleLine?: () => void;
}) {
  const { kind, progress } = props;
  const compact = Boolean(props.compact);

  if (kind === "numbers") {
    const keys = digits(progress.alphabetMode, progress.alphabetPage ?? 0);
    const grid = (
      <Grid3x4 compact={compact}>
        {keys.map((k) => (
          <Key key={k} className="keyButtonValue" onClick={() => props.onDigit?.(k)}>{k}</Key>
        ))}
        {progress.alphabetMode ? (
          <Key className="keyButtonCycle keyButtonCycleIcon" onClick={() => props.onCycleAlphabetPage?.()} title="Cycle letter page">
            <IconCycle size={17} />
          </Key>
        ) : (
          <Key className="keyButtonValue" onClick={() => props.onDigit?.("0")}>0</Key>
        )}
        <Key className="keyButtonCycle" onClick={() => props.onToggleAlphabet?.()}>{progress.alphabetMode ? "123" : "ABC"}</Key>
        <Key className="keyButtonBackspace" onClick={() => props.onBackspace?.()} title="Backspace"><IconBackspace size={26} /></Key>
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
    const palette = highlightPalettePages[progress.highlightPalettePage] ?? highlightPalettePages[0];
    const grid = (
      <Grid3x4 compact={compact}>
        {palette.map((c) => (
          <ColorKey key={c} color={c} onClick={() => props.onColor?.(c)} />
        ))}
        <ColorKey color="#ffffff" onClick={() => props.onWhite?.()} />
        <Key onClick={() => props.onFlipPalette?.()}>⇄</Key>
        <Key className="keyButtonBackspace" onClick={() => props.onBackspace?.()} title="Backspace"><IconBackspace size={26} /></Key>
      </Grid3x4>
    );

    if (compact) return grid;

    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700 }}>Highlight</div>
          <div className="muted">page {progress.highlightPalettePage + 1}/2</div>
        </div>

        {grid}
      </div>
    );
  }

  const lineGrid = (
    <Grid3x4 compact={compact}>
      {linePalette.map((c) => (
        <ColorKey key={c} color={c} onClick={() => props.onColor?.(c)} />
      ))}
      <ColorKey color="#ffffff" onClick={() => props.onColor?.("#ffffff")} />
      <Key active={progress.lineDoubleMode} className="keyButtonValue" onClick={() => props.onToggleDoubleLine?.()} title="Toggle double-line mode">
        2x
      </Key>
      <Key className="keyButtonBackspace" onClick={() => props.onBackspace?.()} title="Backspace"><IconBackspace size={26} /></Key>
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

function Key(props: { children: React.ReactNode; onClick?: () => void; style?: React.CSSProperties; title?: string; className?: string; active?: boolean }) {
  return (
    <button className={"btn keyButton" + (props.active ? " primary" : "") + (props.className ? ` ${props.className}` : "")} style={{ height: "100%", ...props.style }} onClick={props.onClick} title={props.title}>
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