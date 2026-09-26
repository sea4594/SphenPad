import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { SudokuPadScene } from "../sudokupad/types/scene";
import { renderSudokuPadScene } from "../sudokupad/render/renderScene";
import { applySudokuPadFogMasks } from "../sudokupad/fog/fogMasks";
import { applySudokuPadAssets } from "../sudokupad/assets/applyAssets";
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

  useEffect(() => {
    const svg = localRef.current;
    if (!svg) return;
    const controller = new AbortController();
    let cleanupAssets: (() => void) | undefined;
    renderSudokuPadScene(svg, scene);
    const cleanupFog = applySudokuPadFogMasks(svg, scene);
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
