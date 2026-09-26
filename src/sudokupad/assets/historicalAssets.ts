import type { SudokuPadScene } from "../types/scene";
import type { SvgRenderer } from "../render/SvgRenderer";

interface HistoricalBackground {
  path: string;
  width: number;
  height: number;
  opacity: number;
  x: number;
  y: number;
  experimental?: boolean;
}

const HISTORICAL_BACKGROUNDS: Readonly<Record<string, HistoricalBackground>> = {
  jh6RDHdBmq: { path: "/images/puzzles/jh6RDHdBmq.png", width: 580, height: 580, opacity: 0.2, x: -2, y: -2, experimental: true },
  R9h8LBHngd: { path: "/images/puzzles/R9h8LBHngd.png", width: 626, height: 623, opacity: 0.2, x: -25, y: -18, experimental: true },
  TmMBJj8jbr: { path: "/images/puzzles/TmMBJj8jbr.png", width: 600, height: 601, opacity: 1, x: -15, y: -13, experimental: true },
  R68bTRmnrP: { path: "/images/puzzles/R68bTRmnrP.png", width: 550, height: 550, opacity: 0.2, x: 20, y: -50, experimental: true },
  p27QN9Ldtj: { path: "/images/puzzles/p27QN9Ldtj.jpg", width: 960 * 0.7, height: 1025 * 0.7, opacity: 0.3, x: -48, y: -18, experimental: true },
  NJbPwMVNwZ: { path: "/images/puzzles/NJbPwMVNwZ.png", width: 1024 * 0.566, height: 1024 * 0.566, opacity: 0.4, x: -2, y: -2 },
  MONOPOLYSUDOKU: { path: "/images/puzzles/monopolysudoku.png", width: 1024 * 0.66, height: 1024 * 0.66, opacity: 0.4, x: -50, y: -50 },
};

export function renderHistoricalSudokuPadBackground(renderer: SvgRenderer, scene: SudokuPadScene): SVGImageElement | undefined {
  if (!scene.puzzleId) return undefined;
  const def = HISTORICAL_BACKGROUNDS[scene.puzzleId];
  if (!def || (def.experimental && !scene.renderSettings.experimentalMode)) return undefined;
  return renderer.renderPart({
    target: "background",
    type: "image",
    attr: {
      href: new URL(def.path, "https://sudokupad.app").href,
      width: def.width,
      height: def.height,
      opacity: def.opacity,
      x: def.x,
      y: def.y,
      preserveAspectRatio: "none",
      "data-sudokupad-asset-url": def.path,
      "data-sudokupad-asset-kind": "image",
    },
  }) as SVGImageElement;
}
