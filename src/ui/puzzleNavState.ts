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
const MAIN_PAGE_RETURN_STATE_KEY = "sphenpadMainPageReturnState";

type MainPageName = "main-menu" | "folders" | "archive";

type MainPageReturnState = {
  version: 1;
  page: MainPageName;
  scrollY: number;
  context?: PuzzleOriginContext;
};

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
  console.log(
    "[PuzzleNav] Origin state captured:",
    `page=${origin.page}`,
    `path=${origin.path}`,
    `scrollY=${origin.scrollY}`,
    origin.context ? `context=${JSON.stringify(origin.context)}` : ""
  );
  return next;
}

export function withPuzzleReturnState(routeState: unknown, origin: PuzzleOriginState): Record<string, unknown> {
  const next = asStateObject(routeState);
  next[PUZZLE_RETURN_STATE_KEY] = origin;
  return next;
}

export function readPuzzleOriginState(routeState: unknown): PuzzleOriginState | null {
  const stateObj = asStateObject(routeState);
  const originState = normalizeOriginState(stateObj[PUZZLE_ORIGIN_STATE_KEY]);
  if (originState) {
    console.log(
      "[PuzzleNav] Origin state read:",
      `page=${originState.page}`,
      `path=${originState.path}`,
      `scrollY=${originState.scrollY}`,
      originState.context ? `context=${JSON.stringify(originState.context)}` : ""
    );
  }
  return originState;
}

export function readPuzzleReturnState(routeState: unknown): PuzzleOriginState | null {
  const stateObj = asStateObject(routeState);
  const returnState = normalizeOriginState(stateObj[PUZZLE_RETURN_STATE_KEY]);
  if (returnState) {
    console.log(
      "[PuzzleNav] Return state read:",
      `page=${returnState.page}`,
      `path=${returnState.path}`,
      `scrollY=${returnState.scrollY}`,
      returnState.context ? `context=${JSON.stringify(returnState.context)}` : ""
    );
  }
  return returnState;
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
  console.log(`[PuzzleNav] Restoring scroll to position: ${top}`);

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

  window.setTimeout(() => {
    let attempts = 0;
    const maxAttempts = 32;

    const restoreAttempt = () => {
      const actualTop = applyScroll();
      attempts += 1;
      if (Math.abs(actualTop - top) <= 1 || attempts >= maxAttempts) {
        console.log(`[PuzzleNav] Scroll restored to: ${actualTop}`);
        return;
      }
      window.requestAnimationFrame(restoreAttempt);
    };

    restoreAttempt();
  }, 0);
}

export function clearReturnStateFromHistory() {
  if (typeof window === "undefined" || typeof window.history === "undefined") return;
  try {
    window.history.replaceState(null, "", window.location.href);
  } catch {
    // Silently fail if replaceState is not allowed
  }
}

function normalizeMainPageReturnState(raw: unknown): MainPageReturnState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as {
    version?: unknown;
    page?: unknown;
    scrollY?: unknown;
    context?: unknown;
  };
  if (candidate.version !== 1) return null;
  if (candidate.page !== "main-menu" && candidate.page !== "folders" && candidate.page !== "archive") return null;
  if (typeof candidate.scrollY !== "number" || !Number.isFinite(candidate.scrollY)) return null;

  const context = (candidate.context && typeof candidate.context === "object" && !Array.isArray(candidate.context))
    ? candidate.context as PuzzleOriginContext
    : undefined;

  return {
    version: 1,
    page: candidate.page,
    scrollY: Math.max(0, candidate.scrollY),
    context,
  };
}

export function withMainPageReturnState(routeState: unknown, page: MainPageName, scrollY: number, context?: PuzzleOriginContext): Record<string, unknown> {
  const next = asStateObject(routeState);
  next[MAIN_PAGE_RETURN_STATE_KEY] = {
    version: 1,
    page,
    scrollY: Math.max(0, scrollY),
    context,
  };
  console.log(
    "[PuzzleNav] Main page return state captured:",
    `page=${page}`,
    `scrollY=${scrollY}`,
    context ? `context=${JSON.stringify(context)}` : ""
  );
  return next;
}

export function readMainPageReturnState(routeState: unknown): MainPageReturnState | null {
  const stateObj = asStateObject(routeState);
  const returnState = normalizeMainPageReturnState(stateObj[MAIN_PAGE_RETURN_STATE_KEY]);
  if (returnState) {
    console.log(
      "[PuzzleNav] Main page return state read:",
      `page=${returnState.page}`,
      `scrollY=${returnState.scrollY}`,
      returnState.context ? `context=${JSON.stringify(returnState.context)}` : ""
    );
  }
  return returnState;
}

export function clearMainPageReturnStateFromHistory() {
  if (typeof window === "undefined" || typeof window.history === "undefined") return;
  try {
    // Get current state and remove the main page return state key
    const currentState = window.history.state as Record<string, unknown> | null;
    if (currentState && MAIN_PAGE_RETURN_STATE_KEY in currentState) {
      const nextState = { ...currentState };
      delete nextState[MAIN_PAGE_RETURN_STATE_KEY];
      window.history.replaceState(nextState, "", window.location.href);
    }
  } catch {
    // Silently fail if replaceState is not allowed
  }
}
