export type ForcedPortraitDirection = "cw" | "ccw";

export const FORCED_PORTRAIT_ATTR = "data-force-portrait";
export const FORCED_PORTRAIT_REFRESH_DELAYS = [120, 320, 620] as const;

const SCREEN_WIDTH_VAR = "--screen-w";
const SCREEN_HEIGHT_VAR = "--screen-h";

type ViewportSize = {
  vw: number;
  vh: number;
};

function normalizeAngle(angle: number | undefined): number | null {
  if (typeof angle !== "number") return null;
  return ((angle % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getViewportSize(visualViewport?: VisualViewport | null): ViewportSize {
  const width = Math.max(window.innerWidth, visualViewport?.width ?? 0);
  const height = Math.max(window.innerHeight, visualViewport?.height ?? 0);
  return {
    vw: Math.max(1, Math.round(width)),
    vh: Math.max(1, Math.round(height)),
  };
}

export function detectLandscapeDirection(
  screenOrientation: ScreenOrientation | undefined,
  legacyAngle: number | undefined,
  fallback: ForcedPortraitDirection
): ForcedPortraitDirection {
  const orientationType = screenOrientation?.type;
  if (orientationType === "landscape-primary") return "ccw";
  if (orientationType === "landscape-secondary") return "cw";

  if (typeof legacyAngle === "number" && Math.abs(legacyAngle) === 90) {
    return legacyAngle > 0 ? "cw" : "ccw";
  }

  const angle = normalizeAngle(screenOrientation?.angle);
  if (angle === 90) return "ccw";
  if (angle === 270) return "cw";

  return fallback;
}

export function readForcedPortraitDirection(
  root: HTMLElement = document.documentElement
): ForcedPortraitDirection | null {
  const direction = root.getAttribute(FORCED_PORTRAIT_ATTR);
  return direction === "cw" || direction === "ccw" ? direction : null;
}

export function hasForcedPortrait(root: HTMLElement = document.documentElement): boolean {
  return readForcedPortraitDirection(root) !== null;
}

export function applyForcedPortrait(
  root: HTMLElement,
  direction: ForcedPortraitDirection,
  viewport: ViewportSize
) {
  root.style.setProperty(SCREEN_WIDTH_VAR, `${viewport.vw}px`);
  root.style.setProperty(SCREEN_HEIGHT_VAR, `${viewport.vh}px`);
  root.setAttribute(FORCED_PORTRAIT_ATTR, direction);
}

export function clearForcedPortrait(root: HTMLElement) {
  root.removeAttribute(FORCED_PORTRAIT_ATTR);
  root.style.removeProperty(SCREEN_WIDTH_VAR);
  root.style.removeProperty(SCREEN_HEIGHT_VAR);
}

export function observeForcedPortrait(
  onChange: () => void,
  root: HTMLElement = document.documentElement
): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(root, {
    attributes: true,
    attributeFilter: [FORCED_PORTRAIT_ATTR],
  });
  return () => observer.disconnect();
}

export function mapForcedPortraitPoint(
  direction: ForcedPortraitDirection | null,
  width: number,
  height: number,
  x: number,
  y: number
) {
  if (direction === "cw") {
    return {
      x: clamp(width - y, 0, width),
      y: clamp(x, 0, height),
    };
  }

  if (direction === "ccw") {
    return {
      x: clamp(y, 0, width),
      y: clamp(height - x, 0, height),
    };
  }

  return {
    x: clamp(x, 0, width),
    y: clamp(y, 0, height),
  };
}