import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { fmtHMS } from "../core/time";
import { AppBrand } from "./AppBrand";
import { GridCanvas } from "./GridCanvas";
import { IconFolder, IconHome, IconImport, IconSettings } from "./icons";
import { SelectControl } from "./SelectControl";
import { SettingsOverlay } from "./SettingsOverlay";
import {
  clearReturnStateFromHistory,
  currentRoutePath,
  readCurrentScrollPosition,
  readPuzzleReturnState,
  restoreWindowScroll,
  withPuzzleOriginState,
} from "./puzzleNavState";

type SortOrder = "recent" | "az";
type FilterStatus = "all" | "not_started" | "in_progress" | "complete";
type PuzzlePlayStatus = Exclude<FilterStatus, "all">;
type StoredPuzzle = Awaited<ReturnType<typeof listPuzzles>>[number];

type FolderMenuPrefs = {
  sortOrder: SortOrder;
  filterStatus: FilterStatus;
};

const FOLDER_MENU_FILTER_PREFS_KEY = "sphenpad-folder-menu-filters-v1";
const NOOP = () => {};

function isSortOrder(value: string): value is SortOrder {
  return value === "recent" || value === "az";
}

function isFilterStatus(value: string): value is FilterStatus {
  return value === "all" || value === "not_started" || value === "in_progress" || value === "complete";
}

function readInitialFolderMenuPrefs(): FolderMenuPrefs {
  try {
    const raw = localStorage.getItem(FOLDER_MENU_FILTER_PREFS_KEY);
    if (!raw) return { sortOrder: "recent", filterStatus: "all" };

    const parsed = JSON.parse(raw) as {
      sortOrder?: string;
      filterStatus?: string;
    };
    const parsedSortOrder = parsed.sortOrder;
    const parsedFilterStatus = parsed.filterStatus;

    return {
      sortOrder: typeof parsedSortOrder === "string" && isSortOrder(parsedSortOrder) ? parsedSortOrder : "recent",
      filterStatus: typeof parsedFilterStatus === "string" && isFilterStatus(parsedFilterStatus) ? parsedFilterStatus : "all",
    };
  } catch {
    return { sortOrder: "recent", filterStatus: "all" };
  }
}

function puzzleStatus(row: StoredPuzzle): Exclude<FilterStatus, "all"> {
  const status = row.progress?.status ?? "not_started";
  if (status === "complete") return "complete";
  if (status === "in_progress") return "in_progress";
  return "not_started";
}

function statusLabel(status: FilterStatus): string {
  if (status === "not_started") return "Not Started";
  if (status === "in_progress") return "In Progress";
  if (status === "complete") return "Complete";
  return "All";
}

function matchesStatus(row: StoredPuzzle, status: FilterStatus): boolean {
  if (status === "all") return true;
  return puzzleStatus(row) === status;
}

function sortPuzzles(rows: StoredPuzzle[], sortOrder: SortOrder): StoredPuzzle[] {
  const next = [...rows];
  if (sortOrder === "recent") {
    next.sort((a, b) => b.updatedAt - a.updatedAt);
    return next;
  }

  next.sort((a, b) => {
    const ta = (a.def?.meta?.title ?? "").toLowerCase();
    const tb = (b.def?.meta?.title ?? "").toLowerCase();
    if (!ta && tb) return 1;
    if (ta && !tb) return -1;
    return ta.localeCompare(tb);
  });
  return next;
}

function sortFolders(rows: PuzzleFolder[], sortOrder: SortOrder): PuzzleFolder[] {
  const next = [...rows];
  if (sortOrder === "recent") {
    next.sort((a, b) => b.updatedAt - a.updatedAt);
    return next;
  }

  next.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
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

export function FoldersPage() {
  const nav = useNavigate();
  const location = useLocation();
  const initialPrefs = useMemo(readInitialFolderMenuPrefs, []);
  const appliedReturnStateRef = useRef(false);
  const [initialFoldersLoaded, setInitialFoldersLoaded] = useState(false);

  const [rows, setRows] = useState<StoredPuzzle[]>([]);
  const [folders, setFolders] = useState<PuzzleFolder[]>([]);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialPrefs.sortOrder);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(initialPrefs.filterStatus);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);

  const [folderCreateDialogOpen, setFolderCreateDialogOpen] = useState(false);
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateBusy, setFolderCreateBusy] = useState("");

  const [folderPuzzleMenu, setFolderPuzzleMenu] = useState<{ folderId: string; puzzleKey: string } | null>(null);
  const [folderPuzzleStatusMenuKey, setFolderPuzzleStatusMenuKey] = useState<string | null>(null);
  const [folderActionBusyKey, setFolderActionBusyKey] = useState<string | null>(null);
  const [folderRowMenuId, setFolderRowMenuId] = useState<string | null>(null);
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
    void refresh();
  }, []);

  useEffect(() => {
    localStorage.setItem(
      FOLDER_MENU_FILTER_PREFS_KEY,
      JSON.stringify({ sortOrder, filterStatus } satisfies FolderMenuPrefs),
    );
  }, [sortOrder, filterStatus]);

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
    restoreWindowScroll(returned.scrollY);
    clearReturnStateFromHistory();
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
    );
  }, [folders, activeFolderId, sortOrder]);

  const visibleFolderPuzzles = useMemo(() => {
    if (!activeFolder) return [];

    const resolved = activeFolder.puzzleKeys
      .map((key) => puzzleByKey.get(key))
      .filter((row): row is StoredPuzzle => Boolean(row));

    return sortPuzzles(
      resolved.filter((row) => matchesStatus(row, filterStatus)),
      sortOrder,
    );
  }, [activeFolder, puzzleByKey, filterStatus, sortOrder]);

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
    const nextProgress = {
      ...row.progress,
      status,
      startedAt: status === "not_started" ? undefined : (row.progress.startedAt ?? now),
      paused: status === "complete" ? false : row.progress.paused,
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

  return (
    <div className="shell">
      <div className="topbar">
        <AppBrand />
        <div className="spacer" />
        <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings" type="button">
          <IconSettings />
        </button>
      </div>

      <div className="page">
        <div className="mainMenuWrap foldersPageWrap">
          <div className="card menuModeTabsCard">
            <div className="row menuModeTabs" style={{ marginTop: 2 }}>
              <button className="btn menuModeTab" onClick={() => nav("/")} type="button">
                <IconHome />
                <span>Puzzles</span>
              </button>
              <button className="btn primary menuModeTab" onClick={() => nav("/folders")} type="button">
                <IconFolder />
                <span>Folders</span>
              </button>
              <button className="btn menuModeTab" onClick={() => nav("/archive")} type="button">
                <IconImport />
                <span>Import</span>
              </button>
            </div>
          </div>

          <div className="card foldersPageCard">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div className="menuSectionTitle">Folders</div>
              <button
                className="btn"
                onClick={() => {
                  setFolderCreateName("");
                  setFolderCreateDialogOpen(true);
                }}
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
                      <button
                        className="btn menuPuzzleIconButton menuPuzzleMoreButton"
                        onClick={(event) => {
                          event.stopPropagation();
                          setFolderRowMenuId((current) => (current === folder.id ? null : folder.id));
                        }}
                        title="Folder options"
                        aria-label={`Options for folder ${folder.name}`}
                        type="button"
                      >
                        <span aria-hidden>...</span>
                      </button>

                      {folderRowMenuId === folder.id ? (
                        <div className="card menuPuzzleMoreMenu" onClick={(event) => event.stopPropagation()}>
                          <button
                            className="btn menuPuzzleMoreItem"
                            onClick={(event) => {
                              event.stopPropagation();
                              setFolderRowMenuId(null);
                              setRenameFolderTarget(folder);
                              setRenameFolderValue(folder.name);
                            }}
                            type="button"
                          >
                            Rename folder
                          </button>
                          <button
                            className="btn danger menuPuzzleMoreItem"
                            onClick={(event) => {
                              event.stopPropagation();
                              setFolderRowMenuId(null);
                              setDeleteFolderTarget(folder);
                            }}
                            type="button"
                          >
                            Delete folder
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {activeFolder ? (
                <div className="row" style={{ marginTop: 4 }}>
                  <SelectControl
                    className="btn menuControlSelect"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                    aria-label="Sort folders"
                  >
                    <option value="recent">Recent</option>
                    <option value="az">A - Z</option>
                  </SelectControl>
                  <SelectControl
                    className="btn menuControlSelect"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                    aria-label="Filter folders"
                  >
                    <option value="all">All</option>
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="complete">Complete</option>
                  </SelectControl>
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
                    const menuOpen =
                      folderPuzzleMenu?.folderId === activeFolder.id && folderPuzzleMenu.puzzleKey === row.key;
                    const menuBusy = folderActionBusyKey === row.key;
                    const statusMenuKey = `${activeFolder.id}:${row.key}`;
                    const statusMenuOpen = folderPuzzleStatusMenuKey === statusMenuKey;
                    const playStatus = puzzleStatus(row);

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
                            />
                          </div>

                          <div className="row menuPuzzleActions">
                            <button
                              className="btn menuPuzzleIconButton menuPuzzleMoreButton"
                              onClick={(event) => {
                                event.stopPropagation();
                                setFolderPuzzleStatusMenuKey(null);
                                setFolderPuzzleMenu((current) => {
                                  if (!current || current.folderId !== activeFolder.id || current.puzzleKey !== row.key) {
                                    return { folderId: activeFolder.id, puzzleKey: row.key };
                                  }
                                  return null;
                                });
                              }}
                              title="Puzzle actions"
                              aria-label={`Actions for ${row.def?.meta?.title || "puzzle"}`}
                              type="button"
                            >
                              <span aria-hidden>...</span>
                            </button>

                            {menuOpen ? (
                              <div
                                className="card menuPuzzleMoreMenu"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <button
                                  className="btn menuPuzzleMoreItem"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void onRemovePuzzle(activeFolder.id, row.key);
                                  }}
                                  disabled={menuBusy}
                                  type="button"
                                >
                                  Remove from folder
                                </button>

                                <button
                                  className="btn menuPuzzleMoreItem"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenPuzzleInSudokuPad(row);
                                  }}
                                  type="button"
                                >
                                  Open in SudokuPad
                                </button>

                                <button
                                  className="btn menuPuzzleMoreItem"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setFolderPuzzleStatusMenuKey((current) => (current === statusMenuKey ? null : statusMenuKey));
                                  }}
                                  type="button"
                                >
                                  Set status
                                </button>

                                {statusMenuOpen ? (
                                  <div className="menuPuzzleStatusList">
                                    <button
                                      className={`btn menuPuzzleMoreItem ${playStatus === "not_started" ? "primary" : ""}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void onSetPuzzleStatus(row, "not_started");
                                      }}
                                      type="button"
                                    >
                                      Not Started
                                    </button>
                                    <button
                                      className={`btn menuPuzzleMoreItem ${playStatus === "in_progress" ? "primary" : ""}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void onSetPuzzleStatus(row, "in_progress");
                                      }}
                                      type="button"
                                    >
                                      In Progress
                                    </button>
                                    <button
                                      className={`btn menuPuzzleMoreItem ${playStatus === "complete" ? "primary" : ""}`}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void onSetPuzzleStatus(row, "complete");
                                      }}
                                      type="button"
                                    >
                                      Complete
                                    </button>
                                  </div>
                                ) : null}

                                <button
                                  className="btn danger menuPuzzleMoreItem"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setFolderPuzzleMenu(null);
                                    setFolderPuzzleStatusMenuKey(null);
                                    setDeleteCandidate(row);
                                  }}
                                  disabled={menuBusy}
                                  type="button"
                                >
                                  Delete
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!visibleFolderPuzzles.length ? (
                    <div className="muted" style={{ marginTop: 2 }}>
                      {filterStatus === "all"
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
