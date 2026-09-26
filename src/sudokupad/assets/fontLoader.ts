import { defaultSudokuPadAssetResolver, type SudokuPadAssetResolver } from "./assetResolver";
import { getSudokuPadPuzzleFont } from "./fontRegistry";

const loadedFonts = new Map<string, Promise<void>>();

async function loadFontFace(family: string, source: string): Promise<void> {
  const face = new FontFace(family, `url(${source})`);
  (document.fonts as FontFaceSet & { add(face: FontFace): void }).add(face);
  try {
    await face.load();
  } catch (error) {
    try { (document.fonts as FontFaceSet & { delete(face: FontFace): boolean }).delete(face); } catch { /* older DOM implementations */ }
    throw error;
  }
}

/**
 * Load one of SudokuPad's optional puzzle fonts.
 *
 * Production preference is deliberately local-first: when a redistribution-
 * permitted, hash-pinned copy exists under `/assets/fonts/...`, the exact same
 * captured stock path is served by SphenPad itself. If the local asset is not
 * present, fall back to the controlled SudokuPad asset resolver/proxy so fonts
 * with restrictive redistribution terms do not need to be bundled.
 */
export async function ensureSudokuPadPuzzleFont(
  fontId: string | undefined,
  resolver: SudokuPadAssetResolver = defaultSudokuPadAssetResolver,
  signal?: AbortSignal,
): Promise<void> {
  const def = getSudokuPadPuzzleFont(fontId);
  if (!def || typeof FontFace === "undefined" || typeof document === "undefined") return;
  const family = `puzzlefont-${def.id}`;
  if (document.fonts.check(`16px "${family}"`)) return;
  let loading = loadedFonts.get(def.id);
  if (!loading) {
    loading = (async () => {
      // The captured stock path is also SphenPad's production-local path. A
      // missing local binary fails quickly and transparently falls back to the
      // controlled asset resolver below.
      try {
        await loadFontFace(family, def.path);
        return;
      } catch {
        // Continue to remote/proxy fallback.
      }

      let asset: { url: string; revoke: () => void } | undefined;
      try {
        asset = await resolver.createObjectUrl(def.path, "font", signal);
        await loadFontFace(family, asset.url);
      } finally {
        asset?.revoke();
      }
    })();
    loadedFonts.set(def.id, loading);
    loading.catch(() => loadedFonts.delete(def.id));
  }
  await loading;
}
