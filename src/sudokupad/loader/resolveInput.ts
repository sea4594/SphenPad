import type { ResolvedSudokuPadInput, SudokuPadCanonicalFormat } from "../types/formats";
import { getSudokuPadFormat, isRemoteSudokuPadPuzzleId } from "./formatRegistry";
import { emptySudokuPadUrlSettings, parseSudokuPadUrlSettings } from "./urlSettings";
import { fetchSudokuPadPuzzlePayload, type SudokuPadFetchOptions } from "./remotePuzzle";

const KNOWN_HOSTS = new Set(["sudokupad.app", "app.crackingthecryptic.com"]);

function sourceIdFromUrl(url: URL): string {
  const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const queryId = url.searchParams.get("load") ?? url.searchParams.get("puzzle") ?? "";
  const hash = url.hash.replace(/^#/, "");
  if (path) return path;
  if (queryId) return queryId;
  if (hash && !/^puzzle\d+$/.test(hash) && hash !== "experimental") return hash;
  return "";
}

export interface ResolveSudokuPadInputOptions extends SudokuPadFetchOptions {
  /** Treat an unprefixed string as already-resolved payload data instead of a remote ID. Used for archive payloads. */
  resolvedPayload?: boolean;
  /** Preserve the legacy SphenPad convenience of following non-SudokuPad short/redirect URLs. */
  followRedirectUrls?: boolean;
}

export async function resolveSudokuPadInput(input: string, options: ResolveSudokuPadInputOptions = {}): Promise<ResolvedSudokuPadInput> {
  const originalInput = input;
  const trimmed = input.trim();
  let sourceId = trimmed;
  let urlSettings = emptySudokuPadUrlSettings();

  try {
    const url = new URL(trimmed);
    if (KNOWN_HOSTS.has(url.hostname.toLowerCase())) {
      sourceId = sourceIdFromUrl(url);
      urlSettings = parseSudokuPadUrlSettings(url);
    } else if (/^https?:$/.test(url.protocol) && options.followRedirectUrls !== false) {
      const fetchFn = options.fetchFn ?? globalThis.fetch;
      if (fetchFn) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
        try {
          const response = await fetchFn(trimmed, { signal: controller.signal });
          const finalUrl = response.url?.trim();
          if (finalUrl && finalUrl !== trimmed) {
            return resolveSudokuPadInput(finalUrl, { ...options, followRedirectUrls: false });
          }
        } catch { /* fall through and treat the original string as an ID */ }
        finally { clearTimeout(timer); }
      }
    }
  } catch { /* raw payload or id */ }

  const directFormat = getSudokuPadFormat(sourceId);
  if (directFormat) {
    return { originalInput, sourceId, payload: sourceId, format: directFormat as SudokuPadCanonicalFormat, urlSettings };
  }

  if (options.resolvedPayload) {
    return { originalInput, sourceId, payload: sourceId, format: "unknown", urlSettings };
  }

  if (!sourceId) throw new Error("SudokuPad URL does not contain a puzzle ID");
  if (!isRemoteSudokuPadPuzzleId(sourceId)) {
    return { originalInput, sourceId, payload: sourceId, format: getSudokuPadFormat(sourceId) || "unknown", urlSettings };
  }

  const payload = await fetchSudokuPadPuzzlePayload(sourceId, options);
  const format = getSudokuPadFormat(payload) || "unknown";
  return { originalInput, sourceId, payload, format, urlSettings };
}
