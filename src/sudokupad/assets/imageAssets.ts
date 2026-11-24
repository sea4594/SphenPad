import type { SudokuPadScene } from "../types/scene";
import { defaultSudokuPadAssetResolver, type SudokuPadAssetResolver } from "./assetResolver";
import { computeSudokuPadViewBox } from "../render/contentBounds";
import { SvgRenderer } from "../render/SvgRenderer";

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

// Like Twemoji URLs, image object URLs must survive progress-only redraws.
// The resolver is shared by boards and caches the source blobs for this session.
const imageObjectUrlCache = new WeakMap<SudokuPadAssetResolver, Map<string, string>>();
type ImageFrame = { x: number; y: number; width: number; height: number };
const metadataImageFrames = new WeakMap<SVGSVGElement, { key: string; source: string; frame: ImageFrame }>();

/** Capture the *authored* frame before the playable/preview viewport is tightened.
 * Image placement must not change when the surrounding SVG is resized. */
export function rememberSudokuPadBackgroundFrame(svg: SVGSVGElement, scene: SudokuPadScene, key: string, remeasure = false): void {
  const source = scene.metadata.bgimage;
  if (typeof source !== "string" || !source.trim()) { metadataImageFrames.delete(svg); return; }
  const previous = metadataImageFrames.get(svg);
  if (!remeasure && previous?.key === key && previous.source === source) return;
  // An already-restored cached image must not enlarge its own placement on
  // subsequent preview/creator renders (viewBox feedback loop).
  const existing = svg.querySelector<SVGImageElement>('image[data-sudokupad-metadata-background="true"]');
  const originalDisplay = existing?.style.display ?? "";
  if (existing) existing.style.display = "none";
  let bounds: ReturnType<typeof computeSudokuPadViewBox>;
  try { bounds = computeSudokuPadViewBox(new SvgRenderer(svg)); }
  finally { if (existing) existing.style.display = originalDisplay; }
  if (!(bounds.width > 0 && bounds.height > 0)) return;
  metadataImageFrames.set(svg, { key, source, frame: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height } });
}
function cachedImageHref(resolver: SudokuPadAssetResolver, source: string): string | undefined {
  return imageObjectUrlCache.get(resolver)?.get(source);
}
function cacheImageHref(resolver: SudokuPadAssetResolver, source: string, href: string): void {
  let cache = imageObjectUrlCache.get(resolver);
  if (!cache) { cache = new Map(); imageObjectUrlCache.set(resolver, cache); }
  cache.set(source, href);
}
function insertMetadataBackground(svg: SVGSVGElement, scene: SudokuPadScene, href: string): SVGImageElement | undefined {
  if (scene.renderSettings.hideBackgroundImage) return;
  const { bgimage, bgimageopacity, bgimagetarget } = scene.metadata;
  if (typeof bgimage !== "string" || !bgimage.trim()) return;
  const target = svg.querySelector<SVGGElement>(`#${CSS.escape(String(bgimagetarget || "background"))}`);
  if (!target) return;
  const previous = target.querySelector<SVGImageElement>('image[data-sudokupad-metadata-background="true"]');
  if (previous) return previous;
  const remembered = metadataImageFrames.get(svg);
  const viewBox = svg.viewBox.baseVal;
  const frame = remembered?.source === bgimage ? remembered.frame : viewBox;
  const { x: left, y: top, width, height } = frame;
  const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
  image.setAttribute("href", href);
  image.setAttribute("x", String(left)); image.setAttribute("y", String(top));
  image.setAttribute("width", String(width)); image.setAttribute("height", String(height));
  image.setAttribute("opacity", String(parseSudokuPadBackgroundOpacity(bgimageopacity)));
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("data-sudokupad-metadata-background", "true");
  target.appendChild(image);
  return image;
}

/** Restore only previously resolved image assets, synchronously before paint. */
export function restoreCachedSudokuPadImages(svg: SVGSVGElement, scene: SudokuPadScene, resolver: SudokuPadAssetResolver = defaultSudokuPadAssetResolver): void {
  svg.querySelectorAll<SVGImageElement>('image[data-sudokupad-asset-url]').forEach((image) => {
    const source = image.dataset.sudokupadAssetUrl;
    const cached = source && cachedImageHref(resolver, source);
    if (cached) image.setAttribute("href", cached);
  });
  const bgimage = scene.metadata.bgimage;
  if (typeof bgimage === "string") {
    const cached = cachedImageHref(resolver, bgimage);
    if (cached) insertMetadataBackground(svg, scene, cached);
  }
}

export async function resolveTaggedSudokuPadImages(
  svg: SVGSVGElement,
  options: ApplyBackgroundImageOptions = {},
): Promise<() => void> {
  const resolver = options.resolver ?? defaultSudokuPadAssetResolver;
  const images = Array.from(svg.querySelectorAll<SVGImageElement>('image[data-sudokupad-asset-url]'));
  await Promise.all(images.map(async (image) => {
    const source = image.dataset.sudokupadAssetUrl;
    if (!source) return;
    const cached = cachedImageHref(resolver, source);
    if (cached) { image.setAttribute("href", cached); return; }
    try {
      const resolved = await resolver.createObjectUrl(source, "image", options.signal);
      if (options.signal?.aborted || !image.isConnected) { resolved.revoke(); return; }
      cacheImageHref(resolver, source, resolved.url);
      image.setAttribute("href", resolved.url);
    } catch {
      // Keep the direct image href if the sandboxed fetch is unavailable.
    }
  }));
  return () => undefined;
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
  const bgimage = scene.metadata.bgimage;
  if (typeof bgimage !== "string" || !bgimage.trim()) return { cleanup: () => undefined };
  const resolver = options.resolver ?? defaultSudokuPadAssetResolver;
  const existing = svg.querySelector<SVGImageElement>('image[data-sudokupad-metadata-background="true"]');
  if (existing) return { image: existing, cleanup: () => existing.remove() };
  let href = cachedImageHref(resolver, bgimage);
  if (!href) {
    try {
      const resolved = await resolver.createObjectUrl(bgimage, "image", options.signal);
      if (options.signal?.aborted) { resolved.revoke(); return { cleanup: () => undefined }; }
      href = resolved.url;
      cacheImageHref(resolver, bgimage, href);
    } catch {
      // Never bypass inline-image validation/size limits by falling back to
      // the raw data URL. Keep the ordinary remote-image fallback unchanged.
      if (/^data:/i.test(bgimage)) return { cleanup: () => undefined };
      href = resolver.absoluteUrl(bgimage);
    }
  }
  if (options.signal?.aborted) return { cleanup: () => undefined };
  const image = insertMetadataBackground(svg, scene, href);
  return { image, cleanup: () => image?.remove() };
}
