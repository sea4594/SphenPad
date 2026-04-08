type PuzzleOriginPage = "main-menu" | "folders" | "archive";

type PuzzleOriginContext = {
  foldersOpen?: boolean;
  activeFolderId?: string | null;
  visibleRowsCount?: number;
};

export type PuzzleOriginState = {
  version: 1;
  page: PuzzleOriginPage;
  path: string;
  scrollY: number;
  context?: PuzzleOriginContext;
};

const PUZZLE_ORIGIN_STATE_KEY = "sphenpadPuzzleOriginState";
const PUZZLE_RETURN_STATE_KEY = "sphenpadPuzzleReturnState";

function readWindowScrollTop(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(
    0,
    Math.trunc(
      window.scrollY
      || window.pageYOffset
      || document.documentElement.scrollTop
      || document.body?.scrollTop
      || 0,
    ),
  );
}

function getScrollableElements(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  const out: HTMLElement[] = [];
  const push = (el: HTMLElement | null) => {
    if (!el || out.includes(el)) return;
    out.push(el);
  };

  push(document.querySelector<HTMLElement>(".foldersOverlayScroll"));
  push(document.querySelector<HTMLElement>(".shell > .page"));
  push(document.querySelector<HTMLElement>(".page"));
  push(document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null);
  push(document.documentElement);
  push(document.body);

  return out;
}

function asStateObject(state: unknown): Record<string, unknown> {
  if (state && typeof state === "object" && !Array.isArray(state)) {
    return { ...(state as Record<string, unknown>) };
  }
  return {};
}

function normalizeOriginState(raw: unknown): PuzzleOriginState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as {
    version?: unknown;
    page?: unknown;
    path?: unknown;
    scrollY?: unknown;
    context?: unknown;
  };
  if (candidate.version !== 1) return null;
  if (candidate.page !== "main-menu" && candidate.page !== "folders" && candidate.page !== "archive") return null;
  if (typeof candidate.path !== "string" || candidate.path.length < 1) return null;
  if (typeof candidate.scrollY !== "number" || !Number.isFinite(candidate.scrollY)) return null;

  const context = (candidate.context && typeof candidate.context === "object" && !Array.isArray(candidate.context))
    ? candidate.context as PuzzleOriginContext
    : undefined;

  return {
    version: 1,
    page: candidate.page,
    path: candidate.path,
    scrollY: Math.max(0, candidate.scrollY),
    context,
  };
}

export function withPuzzleOriginState(routeState: unknown, origin: PuzzleOriginState): Record<string, unknown> {
  const next = asStateObject(routeState);
  next[PUZZLE_ORIGIN_STATE_KEY] = origin;
  return next;
}

export function withPuzzleReturnState(routeState: unknown, origin: PuzzleOriginState): Record<string, unknown> {
  const next = asStateObject(routeState);
  next[PUZZLE_RETURN_STATE_KEY] = origin;
  return next;
}

export function readPuzzleOriginState(routeState: unknown): PuzzleOriginState | null {
  const stateObj = asStateObject(routeState);
  return normalizeOriginState(stateObj[PUZZLE_ORIGIN_STATE_KEY]);
}

export function readPuzzleReturnState(routeState: unknown): PuzzleOriginState | null {
  const stateObj = asStateObject(routeState);
  return normalizeOriginState(stateObj[PUZZLE_RETURN_STATE_KEY]);
}

export function currentRoutePath(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

export function readCurrentScrollPosition(): number {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  const candidatePositions = [readWindowScrollTop()];
  for (const el of getScrollableElements()) {
    candidatePositions.push(Math.max(0, Math.trunc(el.scrollTop || 0)));
  }
  return Math.max(...candidatePositions);
}

export function clearReturnStateFromHistory() {
  if (typeof window === "undefined" || typeof window.history === "undefined") return;
  try {
    window.history.replaceState(null, "", window.location.href);
  } catch {
    // Silently fail if replaceState is not allowed
  }
}
