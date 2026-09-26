import twemoji from "twemoji";
import { defaultSudokuPadAssetResolver, type SudokuPadAssetResolver } from "./assetResolver";

const UNICODE_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  "🠀🠄🠈🠐🠔🠘🠜🠠🠤🠨🠬🠰🠴🠸🠼🡀🡄🡐🡠🡨🡰🡸🢀🢢🢦🢪🢠🢤🢨🢐🢔🢘": "←",
  "🠂🠆🠊🠒🠖🠚🠞🠢🠦🠪🠮🠲🠶🠺🠾🡂🡆🡒🡢🡪🡲🡺🢂🢣🢧🢫🢡🢥🢩🢒🢖🢚": "→",
  "🠁🠅🠉🠑🠕🠙🠝🠡🠥🠩🠭🠱🠵🠹🠽🡁🡅🡑🡡🡩🡱🡹🢁🢑🢕🢙": "↑",
  "🠃🠇🠋🠓🠗🠛🠟🠣🠧🠫🠯🠳🠷🠻🠿🡃🡇🡓🡣🡫🡳🡻🢃🢓🢗🢛": "↓",
  "🡖🡦🡮🡶🡾🢆": "↘",
  "🡗🡧🡯🡷🡿🢇": "↙",
  "🡔🡤🡬🡴🡼🢄": "↖",
  "🡕🡥🡭🡵🡽🢅": "↗",
};
const ALWAYS_SUPPORTED = "0123456789ABCDEFGHIJKLMaAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ"
  + Object.values(UNICODE_SUBSTITUTIONS).join("");

// Keep resolved Twemoji object URLs alive for the app session. SudokuPadBoard
// redraws authored SVG layers as progress changes; without this cache each
// redraw briefly paints the raw emoji text while an async blob URL is recreated,
// which presents as visible flicker on emoji-heavy puzzles.
const emojiObjectUrlCache = new WeakMap<SudokuPadAssetResolver, Map<string, string>>();
function cachedEmojiHref(resolver: SudokuPadAssetResolver, emojiUrl: string): string | undefined {
  return emojiObjectUrlCache.get(resolver)?.get(emojiUrl);
}
function cacheEmojiHref(resolver: SudokuPadAssetResolver, emojiUrl: string, href: string): void {
  let cache = emojiObjectUrlCache.get(resolver);
  if (!cache) { cache = new Map<string, string>(); emojiObjectUrlCache.set(resolver, cache); }
  cache.set(emojiUrl, href);
}

let testCanvas: HTMLCanvasElement | undefined;
let testContext: CanvasRenderingContext2D | null | undefined;
let refData: string | undefined;

function canvasData(ctx: CanvasRenderingContext2D): string {
  return JSON.stringify(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data);
}

function isCharSupported(text: string): boolean {
  if (ALWAYS_SUPPORTED.includes(text)) return true;
  if (typeof document === "undefined") return true;
  if (!testCanvas) {
    testCanvas = Object.assign(document.createElement("canvas"), { width: 20, height: 20 });
    testContext = testCanvas.getContext("2d", { willReadFrequently: true });
    if (!testContext) return true;
    testContext.fillStyle = "#000";
    testContext.font = "25px sans";
    testContext.fillText("\uFFFF", 0, 20);
    refData = canvasData(testContext);
  }
  if (!testContext || !refData) return true;
  testContext.clearRect(0, 0, 20, 20);
  testContext.fillText(text, 0, 20);
  return refData !== canvasData(testContext);
}

function substitution(text: string): string | undefined {
  return Object.entries(UNICODE_SUBSTITUTIONS).find(([characters]) => characters.includes(text))?.[1];
}


function svgRelativeBounds(textEl: SVGTextElement, svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const savedTransform = textEl.getAttribute("transform");
  if (savedTransform !== null) textEl.setAttribute("transform", savedTransform.replace(/rotate\s*\([^)]*\)/, "rotate(0)"));
  const rect = textEl.getBoundingClientRect();
  if (savedTransform !== null) textEl.setAttribute("transform", savedTransform);
  const svgRect = svg.getBoundingClientRect();
  const viewBox = (svg.getAttribute("viewBox") ?? "0 0 1 1").split(/\s+/).map(Number);
  const scaleX = viewBox[2] ? svgRect.width / viewBox[2] : 1;
  const scaleY = viewBox[3] ? svgRect.height / viewBox[3] : scaleX;
  const scale = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : (Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1);
  const left = svgRect.left - (viewBox[0] ?? 0) * scale;
  const top = svgRect.top - (viewBox[1] ?? 0) * scale;
  return {
    x: (rect.x - left) / scale,
    y: (rect.y - top) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}
function parsedEmojiUrl(text: string): string | undefined {
  const html = twemoji.parse(text, { ext: ".svg", folder: "svg", base: "https://sudokupad.app/assets/twemoji/", className: "emojireplacement" });
  const matches = html.match(/<img class="emojireplacement"/g) ?? [];
  if (matches.length !== 1) return undefined;
  const stripped = html.replace(/<[^>]+>/g, "");
  if (stripped.length !== 0) return undefined;
  return html.match(/\ssrc="([^"]+)"/)?.[1];
}

export async function replaceSudokuPadSvgEmoji(
  svg: SVGSVGElement,
  resolver: SudokuPadAssetResolver = defaultSudokuPadAssetResolver,
  signal?: AbortSignal,
): Promise<() => void> {
  const revokers: Array<() => void> = [];
  const textNodes = Array.from(svg.querySelectorAll<SVGTextElement>("text:not(:empty)"));
  for (const textEl of textNodes) {
    if (signal?.aborted || !textEl.isConnected) break;
    const text = textEl.textContent?.trim() ?? "";
    if (!text) continue;
    const emojiUrl = parsedEmojiUrl(text);
    if (!emojiUrl) {
      if (!isCharSupported(text)) {
        const replacement = substitution(text);
        if (replacement) textEl.textContent = replacement;
      }
      continue;
    }
    let href = cachedEmojiHref(resolver, emojiUrl);
    if (!href) {
      // Do not flash the platform emoji while the stable SVG asset is resolved.
      textEl.style.visibility = "hidden";
      try {
        const resolved = await resolver.createObjectUrl(emojiUrl, "emoji", signal);
        href = resolved.url;
        // Intentionally keep this object URL for the app session. The number of
        // distinct Twemoji assets in a puzzle library is small and this removes
        // the redraw/flicker caused by revoke/recreate cycles.
        cacheEmojiHref(resolver, emojiUrl, href);
      } catch {
        href = resolver.absoluteUrl(emojiUrl);
        cacheEmojiHref(resolver, emojiUrl, href);
      }
    }
    if (signal?.aborted || !textEl.isConnected) continue;

    let bbox: { x: number; y: number; width: number; height: number };
    try { bbox = svgRelativeBounds(textEl, svg); } catch { continue; }
    const image = document.createElementNS("http://www.w3.org/2000/svg", "image");
    image.classList.add("twemoji");
    image.setAttribute("alt", text);
    image.setAttribute("href", href);
    for (const [key, value] of Object.entries(bbox)) {
      image.setAttribute(key, String(+value.toFixed(3)));
    }
    for (const key of ["opacity", "transform"] as const) {
      if (textEl.hasAttribute(key)) image.setAttribute(key, textEl.getAttribute(key)!);
    }
    textEl.after(image);
    textEl.remove();
  }
  return () => revokers.splice(0).forEach((revoke) => revoke());
}
