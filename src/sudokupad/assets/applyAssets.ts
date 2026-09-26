import type { SudokuPadScene } from "../types/scene";
import { defaultSudokuPadAssetResolver, type SudokuPadAssetResolver } from "./assetResolver";
import { replaceSudokuPadSvgEmoji } from "./emojiAssets";
import { ensureSudokuPadPuzzleFont } from "./fontLoader";
import { applySudokuPadMetadataBackground, resolveTaggedSudokuPadImages } from "./imageAssets";
import { SvgRenderer } from "../render/SvgRenderer";
import { computeSudokuPadViewBox } from "../render/contentBounds";

export interface ApplySudokuPadAssetsOptions {
  resolver?: SudokuPadAssetResolver;
  signal?: AbortSignal;
}

export async function applySudokuPadAssets(
  svg: SVGSVGElement,
  scene: SudokuPadScene,
  options: ApplySudokuPadAssetsOptions = {},
): Promise<() => void> {
  const resolver = options.resolver ?? defaultSudokuPadAssetResolver;
  const cleanups: Array<() => void> = [];
  try { await ensureSudokuPadPuzzleFont(scene.renderSettings.puzzleFont, resolver, options.signal); } catch (error) { console.warn("SudokuPad puzzle font failed to load", error); }
  if (options.signal?.aborted) return () => undefined;
  try { cleanups.push(await resolveTaggedSudokuPadImages(svg, { resolver, signal: options.signal })); } catch (error) { console.warn("SudokuPad historical image resolution failed", error); }
  if (options.signal?.aborted) return () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
  let metadataBackgroundImage: SVGImageElement | undefined;
  try {
    const appliedBackground = await applySudokuPadMetadataBackground(svg, scene, { resolver, signal: options.signal });
    cleanups.push(appliedBackground.cleanup);
    metadataBackgroundImage = appliedBackground.image;
  } catch (error) { console.warn("SudokuPad metadata background failed to load", error); }
  // Stock performs a final layout pass after puzzle fonts and late image assets
  // have settled. Text bounds can cross a 16-unit viewBox snap boundary after
  // fonts load, so measuring only during the synchronous scene render is not
  // sufficient. Re-measure before Twemoji replacement, matching stock ordering.
  if (!options.signal?.aborted) {
    try {
      const fonts = svg.ownerDocument.fonts;
      if (fonts) await fonts.ready;
    } catch {
      // Older/test DOMs may not implement document.fonts.
    }
    if (!options.signal?.aborted) {
      const renderer = new SvgRenderer(svg);
      // Stock metadata backgrounds fill the already-computed puzzle viewBox but
      // do not participate in expanding it. Exclude only that late background
      // image while recomputing bounds, then restore it immediately.
      const hadStyleAttribute = metadataBackgroundImage?.hasAttribute("style") ?? false;
      const previousDisplay = metadataBackgroundImage?.style.display ?? "";
      if (metadataBackgroundImage) metadataBackgroundImage.style.display = "none";
      const viewBox = computeSudokuPadViewBox(renderer);
      if (metadataBackgroundImage) {
        metadataBackgroundImage.style.display = previousDisplay;
        if (!hadStyleAttribute && !metadataBackgroundImage.getAttribute("style")) metadataBackgroundImage.removeAttribute("style");
      }
      renderer.adjustViewBox(viewBox.left, viewBox.top, viewBox.width, viewBox.height);
    }
  }
  if (!scene.renderSettings.disableEmoji && !options.signal?.aborted) {
    try { cleanups.push(await replaceSudokuPadSvgEmoji(svg, resolver, options.signal)); } catch (error) { console.warn("SudokuPad emoji replacement failed", error); }
  }
  return () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup());
}
