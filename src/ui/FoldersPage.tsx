import { Fragment, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  createFolder,
  deleteFolder as deleteFolderById,
  deletePuzzle,
  listFolders,
  listPuzzles,
  removePuzzleFromFolder,
  renameFolder,
  type PuzzleFolder,
  upsertPuzzle,
} from "../core/storage";
import { setSyncedLocalStorageItem } from "../core/localDataState";
import { onStorageRefreshNeeded } from "../core/syncSignal";
import { fillProgressWithSolutionDigits } from "../core/solutionFill";
import { fmtHMS } from "../core/time";
import { AppBrand, scrollActiveMainPageToTop } from "./AppBrand";
import { GridCanvas } from "./GridCanvas";
import { IconFolder, IconHome, IconImport, IconSettings, IconSort, IconSortAsc, IconSortDesc } from "./icons";
import { PopupMenuButton } from "./PopupMenuButton";
import { SelectControl, type SelectControlOption } from "./SelectControl";
import { SettingsOverlay } from "./SettingsOverlay";
import {
  currentRoutePath,
  readCurrentScrollPosition,
  readPuzzleReturnState,
  withPuzzleOriginState,
} from "./puzzleNavState";

type SortOrder = "recent" | "az" | "date";
type SortDirection = "asc" | "desc";
type PuzzlePlayStatus = "not_started" | "in_progress" | "complete";
type FilterStatus = PuzzlePlayStatus;
type StoredPuzzle = Awaited<ReturnType<typeof listPuzzles>>[number];

type FolderMenuPrefs = {
  sortOrder: SortOrder;
  sortDirection: SortDirection;
  filterStatusList: FilterStatus[];
};

const FOLDER_MENU_FILTER_PREFS_KEY = "sphenpad-folder-menu-filters-v1";
const FOLDERS_PAGE_MENU_FILTER_PREFS_KEY = "sphenpad-folders-page-menu-filters-v1";
const FOLDER_ACTIVE_ID_KEY = "sphenpad-folders-active-id-v1";
const NOOP = () => {};
const FOLDER_SORT_OPTIONS: SelectControlOption[] = [
  { value: "recent", label: "Recent" },
  { value: "az", label: "A - Z" },
  { value: "date", label: "Video Date" },
];

function isSortOrder(value: string): value is SortOrder {
  return value === "recent" || value === "az" || value === "date";
}

function isSortDirection(value: string): value is SortDirection {
  return value === "asc" || value === "desc";
}

function isPuzzlePlayStatus(value: string): value is PuzzlePlayStatus {
  return value === "not_started" || value === "in_progress" || value === "complete";
}

function readInitialFolderMenuPrefs(): FolderMenuPrefs {
  try {
    const raw = localStorage.getItem(FOLDERS_PAGE_MENU_FILTER_PREFS_KEY)
      ?? localStorage.getItem(FOLDER_MENU_FILTER_PREFS_KEY);
    if (!raw) return { sortOrder: "recent", sortDirection: "desc", filterStatusList: [] };

    const parsed = JSON.parse(raw) as {
      sortOrder?: string;
      sortDirection?: string;
      filterStatusList?: unknown[];
    };
    const parsedSortOrder = parsed.sortOrder;
    const parsedSortDirection = parsed.sortDirection;
    const parsedFilterStatusList = parsed.filterStatusList;

    return {
      sortOrder: typeof parsedSortOrder === "string" && isSortOrder(parsedSortOrder) ? parsedSortOrder : "recent",
      sortDirection: typeof parsedSortDirection === "string" && isSortDirection(parsedSortDirection) ? parsedSortDirection : "desc",
      filterStatusList: Array.isArray(parsedFilterStatusList)
        ? parsedFilterStatusList.filter((v): v is FilterStatus => typeof v === "string" && isPuzzlePlayStatus(v))
        : [],
    };
  } catch {
    return { sortOrder: "recent", sortDirection: "desc", filterStatusList: [] };
  }
}

function readInitialActiveFolderId(): string | null {
  try {
    const raw = localStorage.getItem(FOLDER_ACTIVE_ID_KEY);
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

function puzzleStatus(row: StoredPuzzle): PuzzlePlayStatus {
  const status = row.progress?.status ?? "not_started";
  if (status === "complete") return "complete";
  if (status === "in_progress") return "in_progress";
  return "not_started";
}

function statusLabel(status: PuzzlePlayStatus): string {
  if (status === "not_started") return "Not Started";
  if (status === "in_progress") return "In Progress";
  return "Complete";
}

function matchesStatusList(row: StoredPuzzle, statuses: FilterStatus[]): boolean {
  if (!statuses.length) return true;
  return statuses.includes(puzzleStatus(row));
}

function puzzleVideoDateTs(row: StoredPuzzle): number | null {
  const raw = (row.def?.meta?.archiveVideoDate ?? "").trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortPuzzles(rows: StoredPuzzle[], sortOrder: SortOrder, sortDirection: SortDirection): StoredPuzzle[] {
  const next = [...rows];
  const directionFactor = sortDirection === "asc" ? 1 : -1;
  if (sortOrder === "recent") {
    next.sort((a, b) => (a.updatedAt - b.updatedAt) * directionFactor);
    return next;
  }
  if (sortOrder === "date") {
    next.sort((a, b) => {
      const av = puzzleVideoDateTs(a);
      const bv = puzzleVideoDateTs(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * directionFactor;
    });
    return next;
  }

  next.sort((a, b) => {
    const ta = (a.def?.meta?.title ?? "").toLowerCase();
    const tb = (b.def?.meta?.title ?? "").toLowerCase();
    if (!ta && tb) return 1;
    if (ta && !tb) return -1;
    return ta.localeCompare(tb) * directionFactor;
  });
  return next;
}

function sortFolders(rows: PuzzleFolder[], sortOrder: SortOrder, sortDirection: SortDirection): PuzzleFolder[] {
  const next = [...rows];
  const directionFactor = sortDirection === "asc" ? 1 : -1;
  if (sortOrder === "recent") {
    next.sort((a, b) => (a.updatedAt - b.updatedAt) * directionFactor);
    return next;
  }
  if (sortOrder === "date") {
    next.sort((a, b) => ((a.createdAt ?? 0) - (b.createdAt ?? 0)) * directionFactor);
    return next;
  }

  next.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * directionFactor);
  return next;
}

function buildFolderPath(folder: PuzzleFolder, folderById: Map<string, PuzzleFolder>): string {
  const names: string[] = [folder.name];
  const seen = new Set<string>([folder.id]);
  let cursor = folder.parentId ? folderById.get(folder.parentId) ?? null : null;

  while (cursor && !seen.has(cursor.id)) {
    names.unshift(cursor.name);
    seen.add(cursor.id);
    cursor = cursor.parentId ? folderById.get(cursor.parentId) ?? null : null;
  }

  return names.join(" / ");
}

function hasBorderClues(clues: { top?: string[]; bottom?: string[]; left?: string[]; right?: string[] } | undefined): boolean {
  if (!clues) return false;
  const sides = [clues.top, clues.bottom, clues.left, clues.right];
  return sides.some((side) => Array.isArray(side) && side.some((v) => String(v ?? "").trim().length > 0));
}

function extractConstraintBullets(def: StoredPuzzle["def"]): string[] {
  const out = new Set<string>();
  const cosmetics = def.cosmetics;

  if (cosmetics.cages?.length) out.add("Killer cages");
  if (cosmetics.arrows?.length) out.add("Arrow constraints");
  if (cosmetics.dots?.length) {
    const hasBlack = cosmetics.dots.some((d) => d.kind === "black");
    const hasWhite = cosmetics.dots.some((d) => d.kind === "white");
    if (hasBlack && hasWhite) out.add("Black and white dots");
    else if (hasBlack) out.add("Black dots");
    else if (hasWhite) out.add("White dots");
  }

  if (cosmetics.thermolines?.length) out.add("Thermo lines");
  if (cosmetics.whispers?.length || cosmetics.germanwhispers?.length) out.add("Whisper lines");
  if (cosmetics.palindromes?.length) out.add("Palindrome lines");
  if (cosmetics.renbanlines?.length) out.add("Renban lines");
  if (cosmetics.entropics?.length) out.add("Entropic lines");
  if (cosmetics.modularlines?.length) out.add("Modular lines");

  if (hasBorderClues(cosmetics.skyscraper)) out.add("Skyscraper clues");
  if (hasBorderClues(cosmetics.sandwich)) out.add("Sandwich clues");
  if (hasBorderClues(cosmetics.xsum)) out.add("X-sum clues");
  if (cosmetics.littlekillers?.length) out.add("Little killer clues");

  if (cosmetics.irregularRegions?.length) out.add("Irregular regions");
  if (cosmetics.disjointGroups?.length) out.add("Disjoint groups");

  if (cosmetics.antiKnight) out.add("Anti-knight");
  if (cosmetics.antiKing) out.add("Anti-king");
  if (cosmetics.antiRook) out.add("Anti-rook");

  if ((cosmetics.fogLights?.length ?? 0) > 0 || (cosmetics.fogTriggerEffects?.length ?? 0) > 0) {
    out.add("Fog of war");
  }

  const rules = (def.meta?.rules ?? "").toLowerCase();
  const keywordMap: Array<[RegExp, string]> = [
    [/\bthermo\b/, "Thermo lines"],
    [/\bwhisper\b/, "Whisper lines"],
    [/\brenban\b/, "Renban lines"],
    [/\bpalindrome\b/, "Palindrome lines"],
    [/\barrow\b/, "Arrow constraints"],
    [/\bkiller\b/, "Killer cages"],
    [/\bsandwich\b/, "Sandwich clues"],
    [/\bx\s*-?\s*sum\b/, "X-sum clues"],
    [/\bskyscraper\b/, "Skyscraper clues"],
    [/\blittle\s*killer\b/, "Little killer clues"],
    [/\banti\s*-?\s*knight\b/, "Anti-knight"],
    [/\banti\s*-?\s*king\b/, "Anti-king"],
    [/\banti\s*-?\s*rook\b/, "Anti-rook"],
    [/\bfog\b/, "Fog of war"],
    [/\bentropic\b|\bentropy\b/, "Entropic lines"],
  ];
  for (const [pattern, label] of keywordMap) {
    if (pattern.test(rules)) out.add(label);
  }

  if (!out.size) return ["Normal Sudoku rules only"];
  return Array.from(out);
}

export function FoldersPage(props: { active?: boolean }) {
  const active = props.active ?? true;
  const nav = useNavigate();
  const location = useLocation();
  const initialPrefs = useMemo(readInitialFolderMenuPrefs, []);
  const initialActiveFolderId = useMemo(readInitialActiveFolderId, []);
  const appliedReturnStateRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const [initialFoldersLoaded, setInitialFoldersLoaded] = useState(false);

  const [rows, setRows] = useState<StoredPuzzle[]>([]);
  const [folders, setFolders] = useState<PuzzleFolder[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialPrefs.sortOrder);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialPrefs.sortDirection);
  const [filterStatusList, setFilterStatusList] = useState<FilterStatus[]>(initialPrefs.filterStatusList);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(initialActiveFolderId);

  const [folderCreateDialogOpen, setFolderCreateDialogOpen] = useState(false);
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateBusy, setFolderCreateBusy] = useState("");

  const [, setFolderPuzzleMenu] = useState<{ folderId: string; puzzleKey: string } | null>(null);
  const [, setFolderPuzzleStatusMenuKey] = useState<string | null>(null);
  const [folderActionBusyKey, setFolderActionBusyKey] = useState<string | null>(null);
  const [, setFolderRowMenuId] = useState<string | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<PuzzleFolder | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");
  const [renameFolderBusy, setRenameFolderBusy] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<PuzzleFolder | null>(null);
  const [deleteFolderBusy, setDeleteFolderBusy] = useState(false);

  const [deleteCandidate, setDeleteCandidate] = useState<StoredPuzzle | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function refresh() {
    const [nextRows, nextFolders] = await Promise.all([listPuzzles(), listFolders()]);
    setRows(nextRows);
    setFolders(nextFolders);
    setInitialFoldersLoaded(true);
  }

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active]);

  useEffect(() => {
    if (!active || !pendingRefreshRef.current) return;
    pendingRefreshRef.current = false;
    void refresh();
  }, [active]);

  useEffect(() => {
    return onStorageRefreshNeeded(() => {
      if (!active) {
        pendingRefreshRef.current = true;
        return;
      }
      void refresh();
    });
  }, [active]);

  useEffect(() => {
    setSyncedLocalStorageItem(
      FOLDERS_PAGE_MENU_FILTER_PREFS_KEY,
      JSON.stringify({ sortOrder, sortDirection, filterStatusList } satisfies FolderMenuPrefs),
    );
  }, [sortOrder, sortDirection, filterStatusList]);

  useEffect(() => {
    try {
      if (activeFolderId) {
        localStorage.setItem(FOLDER_ACTIVE_ID_KEY, activeFolderId);
        return;
      }

      localStorage.removeItem(FOLDER_ACTIVE_ID_KEY);
    } catch {
      // Ignore localStorage errors.
    }
  }, [activeFolderId]);

  useEffect(() => {
    if (!initialFoldersLoaded) return;
    if (activeFolderId && !folders.some((folder) => folder.id === activeFolderId)) {
      setActiveFolderId(null);
    }
  }, [activeFolderId, folders, initialFoldersLoaded]);

  useEffect(() => {
    setFolderPuzzleMenu(null);
    setFolderPuzzleStatusMenuKey(null);
    setFolderRowMenuId(null);
  }, [activeFolderId]);

  useEffect(() => {
    if (appliedReturnStateRef.current) return;
    const returned = readPuzzleReturnState(location.state);
    if (!returned || returned.page !== "folders") return;

    appliedReturnStateRef.current = true;
    const activeFolderIdTarget = returned.context?.activeFolderId ?? null;
    
    console.log(
      "[FoldersPage] Restoring state:",
      `activeFolderId=${activeFolderIdTarget}`
    );
    
    setActiveFolderId(activeFolderIdTarget);
  }, [location.state]);


  const folderById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const puzzleByKey = useMemo(() => {
    return new Map(rows.map((row) => [row.key, row]));
  }, [rows]);

  const activeFolder = activeFolderId ? folderById.get(activeFolderId) ?? null : null;

  const activeFolderTrail = useMemo(() => {
    const out: PuzzleFolder[] = [];
    if (!activeFolderId) return out;

    const seen = new Set<string>();
    let cursor: PuzzleFolder | null = folderById.get(activeFolderId) ?? null;
    while (cursor && !seen.has(cursor.id)) {
      out.unshift(cursor);
      seen.add(cursor.id);
      cursor = cursor.parentId ? folderById.get(cursor.parentId) ?? null : null;
    }

    return out;
  }, [activeFolderId, folderById]);

  const visibleChildFolders = useMemo(() => {
    return sortFolders(
      folders.filter((folder) => (folder.parentId ?? null) === activeFolderId),
      sortOrder,
      sortDirection,
    );
  }, [folders, activeFolderId, sortOrder, sortDirection]);

  const visibleFolderPuzzles = useMemo(() => {
    if (!activeFolder) return [];

    const resolved = activeFolder.puzzleKeys
      .map((key) => puzzleByKey.get(key))
      .filter((row): row is StoredPuzzle => Boolean(row));

    return sortPuzzles(
      resolved.filter((row) => matchesStatusList(row, filterStatusList)),
      sortOrder,
      sortDirection,
    );
  }, [activeFolder, puzzleByKey, filterStatusList, sortOrder, sortDirection]);

  const folderStatusCounts = useMemo(() => {
    const counts: Record<PuzzlePlayStatus, number> = {
      not_started: 0,
      in_progress: 0,
      complete: 0,
    };

    if (!activeFolder) return counts;

    for (const key of activeFolder.puzzleKeys) {
      const row = puzzleByKey.get(key);
      if (!row) continue;
      counts[puzzleStatus(row)] += 1;
    }

    return counts;
  }, [activeFolder, puzzleByKey]);

  async function onCreateFolder() {
    const folderName = folderCreateName.trim();
    if (!folderName || folderCreateBusy) return;

    setFolderCreateBusy("Creating folder...");
    try {
      const created = await createFolder(folderName, activeFolderId ?? null);
      await refresh();
      setFolderCreateName("");
      setFolderCreateDialogOpen(false);
      setActiveFolderId(created.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setFolderCreateBusy("");
    }
  }

  function onCreateFolderWithPrompt() {
    if (folderCreateBusy) return;
    const parentLabel = activeFolder
      ? buildFolderPath(activeFolder, folderById)
      : "Top-level folders";
    const input = window.prompt(`Create folder\nParent: ${parentLabel}\n\nFolder name:`);
    if (input == null) return;

    const folderName = input.trim();
    if (!folderName) {
      alert("Folder name cannot be empty.");
      return;
    }

    setFolderCreateBusy("Creating folder...");
    void (async () => {
      try {
        const created = await createFolder(folderName, activeFolderId ?? null);
        await refresh();
        setActiveFolderId(created.id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(msg);
      } finally {
        setFolderCreateBusy("");
      }
    })();
  }

  async function onRemovePuzzle(folderId: string, puzzleKey: string) {
    if (folderActionBusyKey) return;
    setFolderActionBusyKey(puzzleKey);
    try {
      await removePuzzleFromFolder(folderId, puzzleKey);
      await refresh();
      setFolderPuzzleMenu(null);
      setFolderPuzzleStatusMenuKey(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setFolderActionBusyKey(null);
    }
  }

  async function onConfirmDeletePuzzle() {
    if (!deleteCandidate || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deletePuzzle(deleteCandidate.key);
      await refresh();
      setDeleteCandidate(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  function sudokuPadUrlFor(row: StoredPuzzle): string | null {
    const source = (row.def?.sourceId ?? row.key).trim();
    if (!source) return null;
    if (/^https?:\/\//i.test(source)) return source;
    return `https://sudokupad.app/${encodeURI(source.replace(/^\/+/, ""))}`;
  }

  function onOpenPuzzleInSudokuPad(row: StoredPuzzle) {
    const url = sudokuPadUrlFor(row);
    if (!url) {
      alert("No SudokuPad source URL found for this puzzle.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setFolderPuzzleMenu(null);
    setFolderPuzzleStatusMenuKey(null);
  }

  async function onSetPuzzleStatus(row: StoredPuzzle, status: PuzzlePlayStatus) {
    const now = Date.now();
    const solvedProgress =
      status === "complete"
        ? fillProgressWithSolutionDigits(row.progress, row.def.cosmetics.solution)
        : row.progress;
    const nextProgress = {
      ...solvedProgress,
      status,
      startedAt: status === "not_started" ? undefined : (row.progress.startedAt ?? now),
      paused: status === "complete" ? false : solvedProgress.paused,
    };

    try {
      await upsertPuzzle(row.key, {
        def: row.def,
        progress: nextProgress,
        undo: row.undo,
        redo: row.redo,
        updatedAt: now,
        createdAt: row.createdAt,
      });
      await refresh();
      setFolderPuzzleMenu(null);
      setFolderPuzzleStatusMenuKey(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    }
  }

  async function onFolderRowAction(folder: PuzzleFolder, action: "rename" | "delete") {
    if (action === "rename") {
      onRenameFolderWithPrompt(folder);
      return;
    }
    onDeleteFolderWithConfirm(folder);
  }

  async function onPuzzleRowAction(
    folderId: string,
    row: StoredPuzzle,
    action: "remove_from_folder" | "open_in_sudokupad" | "status_not_started" | "status_in_progress" | "status_complete" | "delete",
  ) {
    if (action === "remove_from_folder") {
      await onRemovePuzzle(folderId, row.key);
      return;
    }
    if (action === "open_in_sudokupad") {
      onOpenPuzzleInSudokuPad(row);
      return;
    }
    if (action === "status_not_started") {
      await onSetPuzzleStatus(row, "not_started");
      return;
    }
    if (action === "status_in_progress") {
      await onSetPuzzleStatus(row, "in_progress");
      return;
    }
    if (action === "status_complete") {
      await onSetPuzzleStatus(row, "complete");
      return;
    }
    onDeletePuzzleWithConfirm(row);
  }

  async function onConfirmRenameFolder() {
    if (!renameFolderTarget || renameFolderBusy) return;
    const nextName = renameFolderValue.trim();
    if (!nextName) return;

    setRenameFolderBusy(true);
    try {
      await renameFolder(renameFolderTarget.id, nextName);
      await refresh();
      setRenameFolderTarget(null);
      setRenameFolderValue("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setRenameFolderBusy(false);
    }
  }

  async function onConfirmDeleteFolder() {
    if (!deleteFolderTarget || deleteFolderBusy) return;

    setDeleteFolderBusy(true);
    try {
      await deleteFolderById(deleteFolderTarget.id);
      await refresh();
      setDeleteFolderTarget(null);
      setFolderRowMenuId(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setDeleteFolderBusy(false);
    }
  }

  function onRenameFolderWithPrompt(folder: PuzzleFolder) {
    if (renameFolderBusy) return;
    const input = window.prompt(`Rename folder\n\n${buildFolderPath(folder, folderById)}\n\nNew name:`, folder.name);
    if (input == null) return;

    const nextName = input.trim();
    if (!nextName) {
      alert("Folder name cannot be empty.");
      return;
    }

    setRenameFolderBusy(true);
    void (async () => {
      try {
        await renameFolder(folder.id, nextName);
        await refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(msg);
      } finally {
        setRenameFolderBusy(false);
      }
    })();
  }

  function onDeleteFolderWithConfirm(folder: PuzzleFolder) {
    if (deleteFolderBusy) return;
    const confirmed = window.confirm(
      `Delete folder?\n\n${buildFolderPath(folder, folderById)}\n\nAny subfolders inside it will also be removed.`,
    );
    if (!confirmed) return;

    setDeleteFolderBusy(true);
    void (async () => {
      try {
        await deleteFolderById(folder.id);
        await refresh();
        setFolderRowMenuId(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(msg);
      } finally {
        setDeleteFolderBusy(false);
      }
    })();
  }

  function onDeletePuzzleWithConfirm(row: StoredPuzzle) {
    if (deleteBusy) return;
    const title = row.def?.meta?.title || "(untitled)";
    const confirmed = window.confirm(`Delete puzzle?\n\n${title}`);
    if (!confirmed) return;

    setDeleteBusy(true);
    void (async () => {
      try {
        await deletePuzzle(row.key);
        await refresh();
        setDeleteCandidate(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(msg);
      } finally {
        setDeleteBusy(false);
      }
    })();
  }

  function openPuzzle(key: string) {
    const scrollY = readCurrentScrollPosition();
    console.log(
      "[FoldersPage] Capturing origin state for puzzle:",
      `key=${key}`,
      `activeFolderId=${activeFolderId}`,
      `scrollY=${scrollY}`
    );
    
    nav(`/p/${encodeURIComponent(key)}`, {
      state: withPuzzleOriginState(location.state, {
        version: 1,
        page: "folders",
        path: currentRoutePath(location.pathname, location.search, location.hash),
        scrollY,
        context: {
          activeFolderId,
        },
      }),
    });
  }

  function navigateToMainMenu() {
    startTransition(() => nav("/"));
  }

  function navigateToArchive() {
    startTransition(() => nav("/archive"));
  }

  function scrollCurrentPageToTop() {
    scrollActiveMainPageToTop("smooth");
  }

  function onTopbarTap(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea, [role='button']")) return;
    scrollActiveMainPageToTop("smooth");
  }

  return (
    <div className="shell">
      <div className="topbar" onClick={onTopbarTap}>
        <AppBrand />
        <div className="topbarModeTabs" role="tablist" aria-label="Main navigation">
          <button className="btn topbarModeTab" onClick={navigateToMainMenu} type="button">
            <IconHome />
            <span>Puzzles</span>
          </button>
          <button className="btn primary topbarModeTab" onClick={scrollCurrentPageToTop} type="button">
            <IconFolder />
            <span>Folders</span>
          </button>
          <button className="btn topbarModeTab" onClick={navigateToArchive} type="button">
            <IconImport />
            <span>Import</span>
          </button>
        </div>
        <button className="btn topbarSettingsButton" onClick={() => setSettingsOpen(true)} title="Settings" type="button">
          <IconSettings />
        </button>
      </div>

      <div className="page">
        <div className="mainMenuWrap foldersPageWrap">
          <div className="card foldersPageCard">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div className="menuSectionTitle">Folders</div>
              <button
                className="btn"
                onClick={onCreateFolderWithPrompt}
                type="button"
              >
                New Folder
              </button>
            </div>

            <div className="row folderBreadcrumbRow folderBreadcrumbTrail" style={{ marginTop: 4 }}>
              {[{ id: null, name: "Top Level" }, ...activeFolderTrail].map((folder, index) => (
                <Fragment key={folder.id ?? "top-level"}>
                  {index > 0 ? <span className="folderBreadcrumbSeparator" aria-hidden="true">-&gt;</span> : null}
                  <button
                    className={`folderBreadcrumbLink ${activeFolderId === folder.id ? "is-active" : ""}`}
                    onClick={() => setActiveFolderId(folder.id)}
                    type="button"
                  >
                    {folder.name}
                  </button>
                </Fragment>
              ))}
            </div>

            <div className="menuPuzzleList">
              {visibleChildFolders.map((folder) => {
                return (
                  <div key={folder.id} className="card folderBrowserItem folderBrowserItemWithMenu">
                    <button
                      className="folderBrowserMainButton"
                      onClick={() => setActiveFolderId(folder.id)}
                      type="button"
                    >
                      <div className="row" style={{ gap: 6, alignItems: "flex-start" }}>
                        <IconFolder />
                        <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{folder.name}</div>
                      </div>
                    </button>

                    <div className="row menuPuzzleActions folderBrowserActions">
                      <PopupMenuButton
                        ariaLabel={`Options for folder ${folder.name}`}
                        title="Folder options"
                        className="btn menuPuzzleIconButton menuPuzzleMoreButton"
                        items={[
                          { label: "Rename folder", onSelect: () => void onFolderRowAction(folder, "rename") },
                          { label: "Delete folder", onSelect: () => void onFolderRowAction(folder, "delete"), tone: "danger" },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}

              {activeFolder ? (
                <div style={{ marginTop: 4, display: "grid", gap: 8 }}>
                  <div className="row">
                    <div className="sortControlGroup">
                      <div className="sortSelectWrap">
                        <IconSort />
                        <SelectControl
                          className="btn menuControlSelect"
                          value={sortOrder}
                          onValueChange={(value) => setSortOrder(value as SortOrder)}
                          aria-label="Sort folders"
                          options={FOLDER_SORT_OPTIONS}
                        />
                      </div>
                      <button
                        className="btn sortDirectionButton"
                        onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                        aria-label={sortDirection === "asc" ? "Sort ascending" : "Sort descending"}
                        title={sortDirection === "asc" ? "Ascending" : "Descending"}
                        type="button"
                      >
                        {sortDirection === "asc" ? <IconSortAsc /> : <IconSortDesc />}
                      </button>
                    </div>
                  </div>
                  <div className="menuStatusTabs">
                    {(["not_started", "in_progress", "complete"] as const).map((status) => (
                      <button
                        key={status}
                        className={`btn menuStatusTab ${filterStatusList.includes(status) ? "is-active" : ""}`}
                        onClick={() => setFilterStatusList((prev) =>
                          prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
                        )}
                        type="button"
                      >
                        {statusLabel(status)} ({folderStatusCounts[status]})
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeFolder ? (
                <>
                  {visibleFolderPuzzles.map((row) => {
                    const previewProgress = {
                      ...row.progress,
                      selection: [],
                      multiSelect: false,
                    };
                    const constraintBullets = extractConstraintBullets(row.def);
                    const menuBusy = folderActionBusyKey === row.key;

                    return (
                      <div
                        key={`${activeFolder.id}-${row.key}`}
                        className="card menuPuzzleRow"
                        onClick={() => openPuzzle(row.key)}
                      >
                        <div className="menuPuzzleSummary">
                          <div className="menuPuzzleTitleWrap">
                            <div className="menuPuzzleTitle">{row.def?.meta?.title || "(untitled)"}</div>
                            {row.def?.meta?.author ? (
                              <div className="muted menuPuzzleAuthor">
                                {row.def.meta.author}
                              </div>
                            ) : null}
                            <ul className="menuPuzzleConstraintList">
                              {constraintBullets.map((constraint) => (
                                <li key={`${row.key}-${constraint}`}>{constraint}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="row menuPuzzleMeta">
                            <div>{fmtHMS(row.progress?.totalMillis ?? 0)}</div>
                            <div className="muted" style={{ fontSize: 13 }}>
                              {statusLabel(puzzleStatus(row))}
                            </div>
                          </div>
                        </div>

                        <div className="menuPuzzleDeleteStack">
                          <div className="menuPuzzlePreview" aria-hidden="true">
                            <GridCanvas
                              def={row.def}
                              progress={previewProgress}
                              onSelection={NOOP}
                              onLineStroke={NOOP}
                              onLineTapCell={NOOP}
                              onLineTapEdge={NOOP}
                              onDoubleCell={NOOP}
                              interactive={false}
                              previewMode
                              strictScale
                            />
                          </div>

                          <div className="row menuPuzzleActions">
                            <PopupMenuButton
                              ariaLabel={`Actions for ${row.def?.meta?.title || "puzzle"}`}
                              title="Puzzle actions"
                              className="btn menuPuzzleIconButton menuPuzzleMoreButton"
                              disabled={menuBusy}
                              items={[
                                { label: "Remove from folder", onSelect: () => void onPuzzleRowAction(activeFolder.id, row, "remove_from_folder"), disabled: menuBusy },
                                { label: "Open in SudokuPad", onSelect: () => void onPuzzleRowAction(activeFolder.id, row, "open_in_sudokupad") },
                                {
                                  label: "Set status",
                                  submenu: [
                                    { label: "Not started", onSelect: () => void onPuzzleRowAction(activeFolder.id, row, "status_not_started") },
                                    { label: "In progress", onSelect: () => void onPuzzleRowAction(activeFolder.id, row, "status_in_progress") },
                                    { label: "Complete", onSelect: () => void onPuzzleRowAction(activeFolder.id, row, "status_complete") },
                                  ],
                                },
                                { label: "Delete", onSelect: () => void onPuzzleRowAction(activeFolder.id, row, "delete"), tone: "danger", disabled: menuBusy },
                              ]}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!visibleFolderPuzzles.length ? (
                    <div className="muted" style={{ marginTop: 2 }}>
                      {filterStatusList.length === 0
                        ? "This folder has no puzzles yet."
                        : "No puzzles in this folder match the current filter."}
                    </div>
                  ) : null}
                </>
              ) : null}

              {!visibleChildFolders.length && !activeFolder ? (
                <div className="muted">No folders yet. Use New Folder to get started.</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {folderCreateDialogOpen ? (
        <div className="overlayBackdrop" onClick={() => (!folderCreateBusy ? setFolderCreateDialogOpen(false) : null)}>
          <div
            className="card confirmDialogCard"
            role="dialog"
            aria-modal="true"
            aria-label="Create folder"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Create folder</div>
            <div className="muted" style={{ marginTop: 6 }}>
              {activeFolder
                ? `Parent: ${buildFolderPath(activeFolder, folderById)}`
                : "Parent: Top-level folders"}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                className="url"
                placeholder="Folder name"
                value={folderCreateName}
                onChange={(event) => setFolderCreateName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => setFolderCreateDialogOpen(false)}
                disabled={!!folderCreateBusy}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  void onCreateFolder();
                }}
                disabled={!folderCreateName.trim() || !!folderCreateBusy}
                type="button"
              >
                {folderCreateBusy ? "Creating..." : "New Folder"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div className="overlayBackdrop" onClick={() => (!deleteBusy ? setDeleteCandidate(null) : null)}>
          <div
            className="card confirmDialogCard"
            role="dialog"
            aria-modal="true"
            aria-label="Delete puzzle"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Delete puzzle?</div>
            <div style={{ marginTop: 8 }}>Are you sure you want to delete this puzzle?</div>
            <div className="muted" style={{ marginTop: 6, overflowWrap: "anywhere" }}>
              {deleteCandidate.def?.meta?.title || "(untitled)"}
            </div>

            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setDeleteCandidate(null)} disabled={deleteBusy} type="button">
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  void onConfirmDeletePuzzle();
                }}
                disabled={deleteBusy}
                type="button"
              >
                {deleteBusy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameFolderTarget ? (
        <div className="overlayBackdrop" onClick={() => (!renameFolderBusy ? setRenameFolderTarget(null) : null)}>
          <div
            className="card confirmDialogCard"
            role="dialog"
            aria-modal="true"
            aria-label="Rename folder"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Rename folder</div>
            <div className="muted" style={{ marginTop: 6, overflowWrap: "anywhere" }}>
              {buildFolderPath(renameFolderTarget, folderById)}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                className="url"
                placeholder="Folder name"
                value={renameFolderValue}
                onChange={(event) => setRenameFolderValue(event.target.value)}
                autoFocus
              />
            </div>
            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => setRenameFolderTarget(null)}
                disabled={renameFolderBusy}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  void onConfirmRenameFolder();
                }}
                disabled={!renameFolderValue.trim() || renameFolderBusy}
                type="button"
              >
                {renameFolderBusy ? "Renaming..." : "Rename"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteFolderTarget ? (
        <div className="overlayBackdrop" onClick={() => (!deleteFolderBusy ? setDeleteFolderTarget(null) : null)}>
          <div
            className="card confirmDialogCard"
            role="dialog"
            aria-modal="true"
            aria-label="Delete folder"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Delete folder?</div>
            <div style={{ marginTop: 8 }}>Are you sure you want to delete this folder?</div>
            <div className="muted" style={{ marginTop: 6, overflowWrap: "anywhere" }}>
              {buildFolderPath(deleteFolderTarget, folderById)}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Any subfolders inside it will also be removed.
            </div>

            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button
                className="btn"
                onClick={() => setDeleteFolderTarget(null)}
                disabled={deleteFolderBusy}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  void onConfirmDeleteFolder();
                }}
                disabled={deleteFolderBusy}
                type="button"
              >
                {deleteFolderBusy ? "Deleting..." : "Delete Folder"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
