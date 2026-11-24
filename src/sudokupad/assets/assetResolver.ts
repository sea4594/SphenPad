export type SudokuPadAssetKind = "image" | "font" | "emoji";

export interface SudokuPadAssetResolverOptions {
  sudokuPadOrigin?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** Optional app-controlled proxy. It receives the original absolute URL. */
  proxyUrl?: (absoluteUrl: string, kind: SudokuPadAssetKind) => string | undefined;
}

export interface ResolvedSudokuPadBlobAsset {
  originalUrl: string;
  fetchedUrl: string;
  blob: Blob;
}

const DEFAULT_ORIGIN = "https://sudokupad.app";
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

async function freezeGifFirstFrame(blob: Blob): Promise<Blob> {
  if (blob.type.toLowerCase() !== "image/gif" || typeof document === "undefined" || typeof Image === "undefined") return blob;
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) return blob;
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve) => canvas.toBlob((result) => resolve(result ?? blob), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function assertAllowedUrl(url: URL): void {
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`Unsupported external asset scheme: ${url.protocol}`);
  if (url.username || url.password) throw new Error("Authenticated external asset URLs are not allowed");
}

function validateContentType(kind: SudokuPadAssetKind, type: string | null): void {
  const mime = (type ?? "").split(";", 1)[0].trim().toLowerCase();
  if (kind === "image" || kind === "emoji") {
    if (!mime.startsWith("image/")) throw new Error(`External asset is not an image (${mime || "unknown MIME"})`);
    return;
  }
  if (kind === "font") {
    // Real-world font servers are inconsistent. Reject obvious non-font content,
    // while allowing standard font MIME values and octet-stream.
    const valid = mime.startsWith("font/") || [
      "application/font-sfnt", "application/font-woff", "application/vnd.ms-fontobject",
      "application/octet-stream", "application/x-font-ttf", "application/x-font-opentype",
    ].includes(mime);
    if (mime && !valid) throw new Error(`External asset is not a font (${mime})`);
  }
}

export class SudokuPadAssetResolver {
  readonly sudokuPadOrigin: string;
  private readonly fetchFn?: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly proxyUrl?: SudokuPadAssetResolverOptions["proxyUrl"];
  private readonly blobCache = new Map<string, Promise<ResolvedSudokuPadBlobAsset>>();

  constructor(options: SudokuPadAssetResolverOptions = {}) {
    this.sudokuPadOrigin = options.sudokuPadOrigin ?? DEFAULT_ORIGIN;
    this.fetchFn = options.fetchFn ?? globalThis.fetch?.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.proxyUrl = options.proxyUrl;
  }

  absoluteUrl(input: string): string {
    const url = new URL(input, this.sudokuPadOrigin);
    assertAllowedUrl(url);
    return url.href;
  }

  private async fetchBlobAt(url: string, kind: SudokuPadAssetKind, externalSignal?: AbortSignal): Promise<ResolvedSudokuPadBlobAsset> {
    if (!this.fetchFn) throw new Error("fetch() is unavailable for external SudokuPad asset loading");
    const controller = new AbortController();
    const abort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("Asset request timed out", "TimeoutError")), this.timeoutMs);
    try {
      const response = await this.fetchFn(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Asset request failed: ${response.status} ${response.statusText}`);
      validateContentType(kind, response.headers.get("content-type"));
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > this.maxBytes) throw new Error(`External asset exceeds ${this.maxBytes} bytes`);
      let blob = await response.blob();
      if (blob.size > this.maxBytes) throw new Error(`External asset exceeds ${this.maxBytes} bytes`);
      validateContentType(kind, blob.type || response.headers.get("content-type"));
      if (kind === "image") blob = await freezeGifFirstFrame(blob);
      return { originalUrl: url, fetchedUrl: url, blob };
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abort);
    }
  }

  async fetchBlob(input: string, kind: SudokuPadAssetKind, signal?: AbortSignal): Promise<ResolvedSudokuPadBlobAsset> {
    // SudokuPad puzzles may embed their artwork as data:image/... URLs.
    // Decode those locally (never through the external-asset proxy), with the
    // same MIME and byte limits as fetched images. Other data: kinds stay blocked.
    if (/^data:/i.test(input)) {
      if (kind !== "image" && kind !== "emoji") throw new Error("Inline assets are only supported for images");
      const header = /^data:([^,]*),/i.exec(input);
      const mime = header?.[1].split(";", 1)[0].toLowerCase() ?? "";
      validateContentType(kind, mime);
      if (input.length > this.maxBytes * 3 + 512) throw new Error(`Inline asset exceeds ${this.maxBytes} bytes`);
      const key = `${kind}:${input}`;
      let cached = this.blobCache.get(key);
      if (!cached) {
        cached = (async () => {
          if (signal?.aborted) throw signal.reason;
          // Fetching a data URL is local; do not route it through the injected
          // network fetch or allow an unvalidated href to bypass the limit.
          const response = await globalThis.fetch(input, { signal });
          validateContentType(kind, response.headers.get("content-type"));
          let blob = await response.blob();
          if (blob.size > this.maxBytes) throw new Error(`Inline asset exceeds ${this.maxBytes} bytes`);
          if (kind === "image") blob = await freezeGifFirstFrame(blob);
          return { originalUrl: input, fetchedUrl: input, blob };
        })();
        this.blobCache.set(key, cached);
        cached.catch(() => this.blobCache.delete(key));
      }
      return cached;
    }
    const absolute = this.absoluteUrl(input);
    const key = `${kind}:${absolute}`;
    let cached = this.blobCache.get(key);
    if (!cached) {
      cached = (async () => {
        try {
          return await this.fetchBlobAt(absolute, kind, signal);
        } catch (directError) {
          const proxy = this.proxyUrl?.(absolute, kind);
          if (!proxy || proxy === absolute) throw directError;
          const proxyBase = typeof globalThis.location?.origin === "string" ? globalThis.location.origin : this.sudokuPadOrigin;
          const proxyAbsolute = new URL(proxy, proxyBase);
          assertAllowedUrl(proxyAbsolute);
          const resolved = await this.fetchBlobAt(proxyAbsolute.href, kind, signal);
          return { ...resolved, originalUrl: absolute };
        }
      })();
      this.blobCache.set(key, cached);
      cached.catch(() => this.blobCache.delete(key));
    }
    return cached;
  }

  async createObjectUrl(input: string, kind: SudokuPadAssetKind, signal?: AbortSignal): Promise<{ url: string; revoke: () => void }> {
    const asset = await this.fetchBlob(input, kind, signal);
    const url = URL.createObjectURL(asset.blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
}

export const defaultSudokuPadAssetResolver = new SudokuPadAssetResolver();
