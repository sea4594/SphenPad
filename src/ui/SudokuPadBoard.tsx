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

export interface SudokuPadBoardProps {
  scene: SudokuPadScene;
  className?: string;
  ariaLabel?: string;
  assetResolver?: SudokuPadAssetResolver;
}

export const SudokuPadBoard = forwardRef<SVGSVGElement, SudokuPadBoardProps>(function SudokuPadBoard(
  { scene, className, ariaLabel = "Sudoku puzzle", assetResolver },
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
    renderSudokuPadScene(svg, scene, {
      retainUnchanged: true,
      beforeReconcile: () => {
        restoreCachedSudokuPadImages(svg, scene, assetResolver);
        restoreCachedSudokuPadSvgEmoji(svg, assetResolver);
      },
    });
    // Restore previously resolved assets before paint; the asynchronous pass below
    // is still needed for first-load and for fonts/layout recomputation.
    const cleanupFog = applySudokuPadFogMasks(svg, scene);
    restoreCachedSudokuPadImages(svg, scene, assetResolver);
    restoreCachedSudokuPadSvgEmoji(svg, assetResolver);
    void applySudokuPadAssets(svg, scene, { resolver: assetResolver, signal: controller.signal })
      .then((cleanup) => { if (!controller.signal.aborted) cleanupAssets = cleanup; else cleanup(); })
      .catch((error) => { if (!controller.signal.aborted) console.warn("SudokuPad asset enhancement failed", error); });
    return () => {
      controller.abort();
      cleanupAssets?.();
      cleanupFog();
    };
  }, [scene, assetResolver]);

  return <svg ref={localRef} className={classes} role="img" aria-label={ariaLabel} />;
});
