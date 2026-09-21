export type ViewportLayoutKind =
  | "phone-portrait"
  | "phone-landscape"
  | "tablet-portrait"
  | "tablet-landscape"
  | "desktop";

// These breakpoints are intentionally centralized as the tablet layout baseline.
export const PHONE_MAX_SHORT_SIDE = 760;
export const TABLET_MAX_SHORT_SIDE = 1180;
export const TABLET_MAX_LONG_SIDE = 1700;

function readViewportSize() {
  const viewport = window.visualViewport;
  const width = Math.max(1, viewport?.width ?? window.innerWidth);
  const height = Math.max(1, viewport?.height ?? window.innerHeight);
  return {
    width,
    height,
    shortSide: Math.min(width, height),
    longSide: Math.max(width, height),
  };
}

function likelyTouchViewport(): boolean {
  const ua = window.navigator.userAgent;
  const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const touchPrimaryInput = coarsePointer && window.navigator.maxTouchPoints > 1;
  const touchPlatform = /android|iphone|ipad|ipod|tablet/i.test(ua);
  return coarsePointer || touchPrimaryInput || touchPlatform;
}

export function getViewportLayoutKind(): ViewportLayoutKind {
  if (typeof window === "undefined") return "desktop";
  const { width, height, shortSide, longSide } = readViewportSize();
  const portrait = height >= width;
  const touchLike = likelyTouchViewport();

  if (shortSide <= PHONE_MAX_SHORT_SIDE) {
    return portrait ? "phone-portrait" : "phone-landscape";
  }

  const likelyTablet =
    touchLike && shortSide <= TABLET_MAX_SHORT_SIDE && longSide <= TABLET_MAX_LONG_SIDE;

  if (likelyTablet) {
    return portrait ? "tablet-portrait" : "tablet-landscape";
  }

  return "desktop";
}

export function isMobileFidelityLayout(kind: ViewportLayoutKind): boolean {
  return kind === "phone-portrait" || kind === "phone-landscape" || kind === "tablet-portrait";
}
