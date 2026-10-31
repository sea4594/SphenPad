import { forwardRef, useLayoutEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { SudokuPadScene } from "../sudokupad/types/scene";
import { renderSudokuPadScene } from "../sudokupad/render/renderScene";
import { applySudokuPadFogMasks } from "../sudokupad/fog/fogMasks";
import { applySudokuPadAssets } from "../sudokupad/assets/applyAssets";
import { restoreCachedSudokuPadSvgEmoji } from "../sudokupad/assets/emojiAssets";
import { restoreCachedSudokuPadImages } from "../sudokupad/assets/imageAssets";
import type { SudokuPadAssetResolver } from "../sudokupad/assets/assetResolver";
import { sudokuPadBoardClassNames } from "../sudokupad/app/boardClasses";
import "../sudokupad/styles/sudokupad-renderer.css";
import { applyPlayableGridPaper } from "./playableGridPaper";
import { fitPlayableBoard } from "./playableBoardFit";

export interface SudokuPadBoardProps {
  scene: SudokuPadScene;
  className?: string;
  ariaLabel?: string;
  assetResolver?: SudokuPadAssetResolver;
  whiteBackground?: boolean;
  playableFitKey?: string;
}

export const SudokuPadBoard = forwardRef<SVGSVGElement, SudokuPadBoardProps>(function SudokuPadBoard(
  { scene, className, ariaLabel = "Sudoku puzzle", assetResolver, whiteBackground = false, playableFitKey = "" },
  forwardedRef,
) {
  const localRef = useRef<SVGSVGElement | null>(null);
  useImperativeHandle(forwardedRef, () => localRef.current as SVGSVGElement, []);
  const classes = useMemo(() => [...sudokuPadBoardClassNames(scene), className ?? ""].filter(Boolean).join(" "), [scene, className]);

  useLayoutEffect(() => {
    const svg = localRef.current;
    if (!svg) return;
    const controller = new AbortController();
    let cleanupAssets: (() => void) | undefined;
    const playable = Boolean(svg.closest(".puzzleShell:not(.creatorEditorShell)"));
    const preview = Boolean(svg.closest(".sphenpad-native-board.preview"));
    renderSudokuPadScene(svg, scene, {
      retainUnchanged: true,
      preserveViewBox: playable,
      beforeReconcile: () => {
        restoreCachedSudokuPadImages(svg, scene, assetResolver);
        restoreCachedSudokuPadSvgEmoji(svg, assetResolver);
      },
    });
    if (playable) fitPlayableBoard(svg, scene.rows, scene.cols, playableFitKey);
    // Restore previously resolved assets before paint; the asynchronous pass below
    // is still needed for first-load and for fonts/layout recomputation.
    const cleanupFog = applySudokuPadFogMasks(svg, scene);
    const cleanupPaper = (playable || preview)
      ? applyPlayableGridPaper(svg, scene.rows, scene.cols, whiteBackground) : () => undefined;
    restoreCachedSudokuPadImages(svg, scene, assetResolver);
    restoreCachedSudokuPadSvgEmoji(svg, assetResolver);
    void applySudokuPadAssets(svg, scene, { resolver: assetResolver, signal: controller.signal, tightPlayableFit: playable ? playableFitKey : undefined })
      .then((cleanup) => {
        if (!controller.signal.aborted) {
          cleanupAssets = cleanup;
          if (playable) fitPlayableBoard(svg, scene.rows, scene.cols, playableFitKey);
        } else cleanup();
      })
      .catch((error) => { if (!controller.signal.aborted) console.warn("SudokuPad asset enhancement failed", error); });
    return () => {
      controller.abort();
      cleanupAssets?.();
      cleanupPaper();
      cleanupFog();
    };
  }, [scene, assetResolver, whiteBackground, playableFitKey]);

  return <svg ref={localRef} className={classes} role="img" aria-label={ariaLabel} />;
});
