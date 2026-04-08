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

type MainPageName = "main-menu" | "folders" | "archive";

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

export function restoreWindowScroll(scrollY: number) {
  const top = Math.max(0, Math.trunc(scrollY));
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const applyScroll = () => {
    window.scrollTo({ top, left: 0, behavior: "auto" });
    for (const el of getScrollableElements()) {
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ top, left: 0, behavior: "auto" });
      } else {
        el.scrollTop = top;
      }
    }

    return readCurrentScrollPosition();
  };

  const runRestorePass = () => {
    let attempts = 0;
    const maxAttempts = 12;

    const restoreAttempt = () => {
      const actualTop = applyScroll();
      attempts += 1;
      if (Math.abs(actualTop - top) <= 1 || attempts >= maxAttempts) return;
      window.requestAnimationFrame(restoreAttempt);
    };

    restoreAttempt();
  };

  // First pass for immediate paint, then delayed passes for pages that render content
  // asynchronously and would otherwise "snap" away from the target position.
  window.setTimeout(runRestorePass, 0);
  window.setTimeout(runRestorePass, 120);
  window.setTimeout(runRestorePass, 320);
}

export function clearReturnStateFromHistory() {
  if (typeof window === "undefined" || typeof window.history === "undefined") return;
  try {
    window.history.replaceState(null, "", window.location.href);
  } catch {
    // Silently fail if replaceState is not allowed
  }
}

// Simple localStorage-based scroll position persistence for main pages.
const MAIN_PAGE_SCROLL_KEY_PREFIX = "sphenpadMainPageScroll_";

export function getMainPageScrollStorageKey(page: MainPageName): string {
  return `${MAIN_PAGE_SCROLL_KEY_PREFIX}${page}`;
}

export function saveMainPageScroll(page: MainPageName, scrollY: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(getMainPageScrollStorageKey(page), String(Math.max(0, scrollY)));
  } catch {
    // Silently fail if localStorage is not available.
  }
}

export function loadMainPageScroll(page: MainPageName): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const stored = localStorage.getItem(getMainPageScrollStorageKey(page));
    if (typeof stored === "string") {
      const parsed = parseInt(stored, 10);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
  } catch {
    // Silently fail if localStorage is not available.
  }
  return 0;
}

export function setupPageScrollAutoSave(page: MainPageName): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let saveTimeout: number | null = null;
  const trackedElements = getScrollableElements();

  const saveNow = () => {
    const scrollY = readCurrentScrollPosition();
    saveMainPageScroll(page, scrollY);
  };

  const handleScroll = () => {
    if (saveTimeout !== null) {
      window.clearTimeout(saveTimeout);
    }
    saveTimeout = window.setTimeout(() => {
      saveNow();
    }, 200);
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") saveNow();
  };

  const handlePageHide = () => {
    saveNow();
  };

  window.addEventListener("scroll", handleScroll);
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  for (const el of trackedElements) {
    el.addEventListener("scroll", handleScroll, { passive: true });
  }

  return () => {
    window.removeEventListener("scroll", handleScroll);
    window.removeEventListener("pagehide", handlePageHide);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    for (const el of trackedElements) {
      el.removeEventListener("scroll", handleScroll);
    }
    if (saveTimeout !== null) {
      window.clearTimeout(saveTimeout);
    }
    saveNow();
  };
}
