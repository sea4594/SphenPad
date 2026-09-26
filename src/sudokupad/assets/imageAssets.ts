import type { SudokuPadScene } from "../types/scene";
import { defaultSudokuPadAssetResolver, type SudokuPadAssetResolver } from "./assetResolver";

export function parseSudokuPadBackgroundOpacity(value: unknown): number {
  let opacity = Number.parseFloat(String(value));
  if (Number.isNaN(opacity)) opacity = 0.2;
  opacity = Math.max(0, Math.min(1, opacity));
  return Math.round(opacity * 100) * 0.01;
}

export interface ApplyBackgroundImageOptions {
  resolver?: SudokuPadAssetResolver;
  signal?: AbortSignal;
}

export async function resolveTaggedSudokuPadImages(
  svg: SVGSVGElement,
  options: ApplyBackgroundImageOptions = {},
): Promise<() => void> {
  const resolver = options.resolver ?? defaultSudokuPadAssetResolver;
  const revokers: Array<() => void> = [];
  const images = Array.from(svg.querySelectorAll<SVGImageElement>('image[data-sudokupad-asset-url]'));
  await Promise.all(images.map(async (image) => {
    const source = image.dataset.sudokupadAssetUrl;
    if (!source) return;
    try {
      const resolved = await resolver.createObjectUrl(source, "image", options.signal);
      if (options.signal?.aborted || !image.isConnected) { resolved.revoke(); return; }
      image.setAttribute("href", resolved.url);
      revokers.push(resolved.revoke);
    } catch {
      // Keep the direct absolute href already attached. This mirrors normal browser
      // image fallback when fetch/CORS sanitization is unavailable.
    }
  }));
  return () => revokers.splice(0).forEach((revoke) => revoke());
}

export interface AppliedSudokuPadMetadataBackground {
  cleanup: () => void;
  image?: SVGImageElement;
}

export async function applySudokuPadMetadataBackground(
  svg: SVGSVGElement,
  scene: SudokuPadScene,
  options: ApplyBackgroundImageOptions = {},
): Promise<AppliedSudokuPadMetadataBackground> {
  if (scene.renderSettings.hideBackgroundImage) return { cleanup: () => undefined };
  const { bgimage, bgimageopacity, bgimagetarget } = scene.metadata;
  if (typeof bgimage !== "string" || !bgimage.trim()) return { cleanup: () => undefined };
  const target = svg.querySelector<SVGGElement>(`#${CSS.escape(String(bgimagetarget || "background"))}`);
  if (!target) return { cleanup: () => undefined };
  const resolver = options.resolver ?? defaultSudokuPadAssetResolver;
  let resolved: { url: string; revoke: () => void } | undefined;
  try { resolved = await resolver.createObjectUrl(bgimage, "image", options.signal); } catch { /* direct SVG-image fallback below */ }
  if (options.signal?.aborted) { resolved?.revoke(); return { cleanup: () => undefined }; }
  const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [];
  const [left = 0, top = 0, width = scene.cols * 64, height = scene.rows * 64] = viewBox;
  const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
  image.setAttribute("href", resolved?.url ?? resolver.absoluteUrl(bgimage));
  image.setAttribute("x", String(left));
  image.setAttribute("y", String(top));
  image.setAttribute("width", String(width));
  image.setAttribute("height", String(height));
  image.setAttribute("opacity", String(parseSudokuPadBackgroundOpacity(bgimageopacity)));
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("data-sudokupad-metadata-background", "true");
  target.appendChild(image);
  return { image, cleanup: () => { image.remove(); resolved?.revoke(); } };
}
