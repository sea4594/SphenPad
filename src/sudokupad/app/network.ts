import { apiEncodePuzzleId, apiPuzzleUrlLegacy, apiPuzzleUrlLegacyProxy, type SudokuPadFetchOptions } from "../loader/remotePuzzle";
import { SudokuPadAssetResolver, type SudokuPadAssetKind } from "../assets/assetResolver";

function env(name: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[name];
  return value?.trim() || undefined;
}

function proxyBase(): string | undefined {
  return env("VITE_SUDOKUPAD_PROXY_BASE")?.replace(/\/+$/, "");
}

/**
 * App-level network policy. Decoder/importer code remains endpoint-agnostic;
 * SphenPad decides here whether to use a controlled edge proxy.
 */
export function sphenPadSudokuPadFetchOptions(): SudokuPadFetchOptions {
  const proxy = proxyBase();
  return {
    urls: (puzzleId) => {
      const encoded = apiEncodePuzzleId(puzzleId);
      const urls: string[] = [];
      // Vite development proxy. In static production this simply fails fast and
      // the controlled proxy/stock fallbacks below are tried next.
      urls.push(`/sp-api/api/puzzle/${encoded}`);
      if (proxy) urls.push(`${proxy}/puzzle/${encoded}`);
      urls.push(apiPuzzleUrlLegacyProxy(puzzleId), apiPuzzleUrlLegacy(puzzleId));
      return urls;
    },
  };
}

function assetProxyUrl(absoluteUrl: string, kind: SudokuPadAssetKind): string | undefined {
  const proxy = proxyBase();
  if (!proxy) return undefined;
  return `${proxy}/asset?kind=${encodeURIComponent(kind)}&url=${encodeURIComponent(absoluteUrl)}`;
}

export const sphenPadSudokuPadAssetResolver = new SudokuPadAssetResolver({
  proxyUrl: assetProxyUrl,
});
