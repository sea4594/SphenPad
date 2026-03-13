import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadFromSudokuPad } from "../core/sudokupad";
import {
  addPuzzleToFolder,
  createFolder,
  deletePuzzle,
  listFolders,
  listPuzzles,
  type PuzzleFolder,
  upsertPuzzle,
} from "../core/storage";
import { makeInitialProgress } from "../core/scl";
import { fmtHMS } from "../core/time";
import { firebaseEnabled, googleLogin, googleLogout } from "../firebase/client";
import { GridCanvas } from "./GridCanvas";
import { IconFolder, IconFolderAdd, IconSettings } from "./icons";
import { SettingsOverlay } from "./SettingsOverlay";

type SortOrder = "recent" | "az";
type FilterStatus = "all" | "not_started" | "in_progress" | "complete";
type StoredPuzzle = Awaited<ReturnType<typeof listPuzzles>>[number];

type MainMenuFilterPrefs = {
  sortOrder: SortOrder;
  filterStatus: FilterStatus;
};

type FolderMenuPrefs = {
  sortOrder: SortOrder;
  filterStatus: FilterStatus;
};

const MAIN_MENU_FILTER_PREFS_KEY = "sphenpad-main-menu-filters-v1";
const FOLDER_MENU_PREFS_KEY = "sphenpad-folder-menu-filters-v1";
const ROOT_FOLDER_OPTION = "__root__";
const CURRENT_FOLDER_OPTION = "__current__";

const NOOP = () => {};

function isSortOrder(value: string): value is SortOrder {
  return value === "recent" || value === "az";
}

function isFilterStatus(value: string): value is FilterStatus {
  return value === "all" || value === "not_started" || value === "in_progress" || value === "complete";
}

function readInitialMainMenuFilterPrefs(): MainMenuFilterPrefs {
  try {
    const raw = localStorage.getItem(MAIN_MENU_FILTER_PREFS_KEY);
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

function readInitialFolderMenuPrefs(): FolderMenuPrefs {
  try {
    const raw = localStorage.getItem(FOLDER_MENU_PREFS_KEY);
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

function resolveFolderParentId(selection: string, activeFolderId: string | null): string | null {
  if (selection === ROOT_FOLDER_OPTION) return null;
  if (selection === CURRENT_FOLDER_OPTION) return activeFolderId;
  return selection;
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

export function MainMenu() {
  const nav = useNavigate();
  const initialFilterPrefs = useMemo(readInitialMainMenuFilterPrefs, []);
  const initialFolderPrefs = useMemo(readInitialFolderMenuPrefs, []);

  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<StoredPuzzle[]>([]);
  const [folders, setFolders] = useState<PuzzleFolder[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialFilterPrefs.sortOrder);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(initialFilterPrefs.filterStatus);

  const [foldersOpen, setFoldersOpen] = useState(false);
  const [folderSortOrder, setFolderSortOrder] = useState<SortOrder>(initialFolderPrefs.sortOrder);
  const [folderFilterStatus, setFolderFilterStatus] = useState<FilterStatus>(initialFolderPrefs.filterStatus);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderCreateName, setFolderCreateName] = useState("");
  const [folderCreateParentId, setFolderCreateParentId] = useState<string>(CURRENT_FOLDER_OPTION);
  const [folderCreateBusy, setFolderCreateBusy] = useState("");

  const [deleteCandidate, setDeleteCandidate] = useState<StoredPuzzle | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [addToFolderPuzzle, setAddToFolderPuzzle] = useState<StoredPuzzle | null>(null);
  const [addToFolderBusy, setAddToFolderBusy] = useState("");
  const [addFolderName, setAddFolderName] = useState("");
  const [addFolderParentId, setAddFolderParentId] = useState<string>(ROOT_FOLDER_OPTION);

  async function refreshPuzzles() {
    setRows(await listPuzzles());
  }

  async function refreshFolders() {
    setFolders(await listFolders());
  }

  useEffect(() => {
    void refreshPuzzles();
    void refreshFolders();
  }, []);

  useEffect(() => {
    localStorage.setItem(
      MAIN_MENU_FILTER_PREFS_KEY,
      JSON.stringify({ sortOrder, filterStatus } satisfies MainMenuFilterPrefs),
    );
  }, [sortOrder, filterStatus]);

  useEffect(() => {
    localStorage.setItem(
      FOLDER_MENU_PREFS_KEY,
      JSON.stringify({ sortOrder: folderSortOrder, filterStatus: folderFilterStatus } satisfies FolderMenuPrefs),
    );
  }, [folderSortOrder, folderFilterStatus]);

  useEffect(() => {
    if (activeFolderId && !folders.some((folder) => folder.id === activeFolderId)) {
      setActiveFolderId(null);
    }
  }, [activeFolderId, folders]);

  const totals = useMemo(() => {
    const ms = rows.reduce((a, r) => a + (r.progress?.totalMillis ?? 0), 0);
    return fmtHMS(ms);
  }, [rows]);

  const statusCounts = useMemo(() => {
    const counts: Record<FilterStatus, number> = {
      all: rows.length,
      not_started: 0,
      in_progress: 0,
      complete: 0,
    };

    for (const row of rows) {
      counts[puzzleStatus(row)] += 1;
    }
    return counts;
  }, [rows]);

  const folderById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const puzzleByKey = useMemo(() => {
    return new Map(rows.map((row) => [row.key, row]));
  }, [rows]);

  const folderPathOptions = useMemo(() => {
    return folders
      .map((folder) => ({
        folder,
        path: buildFolderPath(folder, folderById),
      }))
      .sort((a, b) => a.path.toLowerCase().localeCompare(b.path.toLowerCase()));
  }, [folders, folderById]);

  const displayRows = useMemo(() => {
    return sortPuzzles(
      rows.filter((row) => matchesStatus(row, filterStatus)),
      sortOrder,
    );
  }, [rows, sortOrder, filterStatus]);

  const folderChildCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of folders) {
      if (!folder.parentId) continue;
      counts.set(folder.parentId, (counts.get(folder.parentId) ?? 0) + 1);
    }
    return counts;
  }, [folders]);

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
      folderSortOrder,
    );
  }, [folders, activeFolderId, folderSortOrder]);

  const visibleFolderPuzzles = useMemo(() => {
    if (!activeFolder) return [];

    const resolved = activeFolder.puzzleKeys
      .map((key) => puzzleByKey.get(key))
      .filter((row): row is StoredPuzzle => Boolean(row));

    return sortPuzzles(
      resolved.filter((row) => matchesStatus(row, folderFilterStatus)),
      folderSortOrder,
    );
  }, [activeFolder, puzzleByKey, folderFilterStatus, folderSortOrder]);

  const selectedPuzzleFolderIds = useMemo(() => {
    const ids = new Set<string>();
    if (!addToFolderPuzzle) return ids;

    for (const folder of folders) {
      if (folder.puzzleKeys.includes(addToFolderPuzzle.key)) ids.add(folder.id);
    }

    return ids;
  }, [addToFolderPuzzle, folders]);

  async function onLoad() {
    setBusy("Loading puzzle...");
    try {
      const { key, def } = await loadFromSudokuPad(url);
      const progress = makeInitialProgress(def);
      const now = Date.now();
      await upsertPuzzle(key, { def, progress, undo: [], redo: [], updatedAt: now, createdAt: now });
      await refreshPuzzles();
      nav(`/p/${encodeURIComponent(key)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setBusy("");
    }
  }

  async function onConfirmDeletePuzzle() {
    if (!deleteCandidate || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deletePuzzle(deleteCandidate.key);
      await refreshPuzzles();
      await refreshFolders();
      setDeleteCandidate(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  function onOpenFolders() {
    setFoldersOpen(true);
    setActiveFolderId(null);
    setFolderCreateParentId(CURRENT_FOLDER_OPTION);
    void refreshFolders();
  }

  function openPuzzle(key: string) {
    nav(`/p/${encodeURIComponent(key)}`);
  }

  function onOpenAddToFolder(puzzle: StoredPuzzle) {
    setAddToFolderPuzzle(puzzle);
    setAddToFolderBusy("");
    setAddFolderName("");
    setAddFolderParentId(ROOT_FOLDER_OPTION);
    void refreshFolders();
  }

  async function onAddPuzzleToExistingFolder(folderId: string) {
    if (!addToFolderPuzzle) return;
    setAddToFolderBusy("Adding puzzle to folder...");
    try {
      await addPuzzleToFolder(folderId, addToFolderPuzzle.key);
      await refreshFolders();
      setAddToFolderPuzzle(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setAddToFolderBusy("");
    }
  }

  async function onCreateFolderAndAddPuzzle() {
    if (!addToFolderPuzzle) return;
    const folderName = addFolderName.trim();
    if (!folderName) return;

    const parentId = addFolderParentId === ROOT_FOLDER_OPTION ? null : addFolderParentId;

    setAddToFolderBusy("Creating folder...");
    try {
      const created = await createFolder(folderName, parentId);
      await addPuzzleToFolder(created.id, addToFolderPuzzle.key);
      await refreshFolders();
      setAddToFolderPuzzle(null);
      setAddFolderName("");
      setAddFolderParentId(ROOT_FOLDER_OPTION);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setAddToFolderBusy("");
    }
  }

  async function onCreateFolderFromFoldersMenu() {
    const folderName = folderCreateName.trim();
    if (!folderName || folderCreateBusy) return;

    const parentId = resolveFolderParentId(folderCreateParentId, activeFolderId);

    setFolderCreateBusy("Creating folder...");
    try {
      const created = await createFolder(folderName, parentId);
      await refreshFolders();
      setFolderCreateName("");
      setFolderCreateParentId(CURRENT_FOLDER_OPTION);
      setActiveFolderId(created.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setFolderCreateBusy("");
    }
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">SphenPad</div>
        <div className="muted">Total time: {totals}</div>
        <div className="spacer" />
        <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings" type="button">
          <IconSettings />
        </button>
        {firebaseEnabled ? (
          <div className="row">
            <button className="btn" onClick={() => googleLogin().catch((e) => alert(e.message))} type="button">Google login</button>
            <button className="btn" onClick={() => googleLogout().catch((e) => alert(e.message))} type="button">Logout</button>
          </div>
        ) : (
          <div className="muted">Google sync: disabled (no env vars)</div>
        )}
      </div>

      <div className="page">
        <div className="mainMenuWrap">
          <div className="card">
            <div className="menuSectionTitle">Load Puzzle</div>
            <div className="muted" style={{ marginTop: 2 }}>Paste a sudokupad.app link or a puzzle id</div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => nav("/archive")} type="button">
                Import from CtC archive
              </button>
              <input
                className="url"
                placeholder="https://sudokupad.app/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button className="btn primary" onClick={onLoad} disabled={!url || !!busy} type="button">
                Load
              </button>
            </div>
            {busy ? <div className="muted" style={{ marginTop: 10 }}>{busy}</div> : null}
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="menuSectionTitle">Your puzzles</div>
              <div className="muted">
                {filterStatus !== "all"
                  ? `${displayRows.length} of ${rows.length}`
                  : `${rows.length} total`}
              </div>
            </div>

            <div className="row" style={{ marginTop: 8, justifyContent: "space-between", alignItems: "flex-end" }}>
              <label className="menuControlLabel">
                <span className="muted" style={{ fontSize: 13 }}>Sort</span>
                <select
                  className="btn menuControlSelect"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                >
                  <option value="recent">Recent</option>
                  <option value="az">A - Z</option>
                </select>
              </label>

              <button className="btn menuFolderButton" onClick={onOpenFolders} type="button">
                <IconFolder />
                <span>Folders</span>
              </button>
            </div>

            <div className="menuStatusTabs" style={{ marginTop: 8 }}>
              {(["all", "not_started", "in_progress", "complete"] as const).map((status) => (
                <button
                  key={status}
                  className={`btn menuStatusTab ${filterStatus === status ? "is-active" : ""}`}
                  onClick={() => setFilterStatus(status)}
                  type="button"
                >
                  {statusLabel(status)} ({statusCounts[status]})
                </button>
              ))}
            </div>

            <div className="menuPuzzleList">
              {displayRows.map((row) => {
                const previewProgress = {
                  ...row.progress,
                  selection: [],
                  multiSelect: false,
                };
                const constraintBullets = extractConstraintBullets(row.def);

                return (
                  <div
                    key={row.key}
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
                          className="btn menuPuzzleIconButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenAddToFolder(row);
                          }}
                          title="Add to folder"
                          aria-label={`Add ${row.def?.meta?.title || "puzzle"} to folder`}
                          type="button"
                        >
                          <IconFolderAdd />
                        </button>

                        <button
                          className="btn danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteCandidate(row);
                          }}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!displayRows.length ? (
                <div className="muted">
                  {filterStatus !== "all" ? "No puzzles match the current filter." : "No puzzles loaded yet."}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {foldersOpen ? (
        <div className="overlayBackdrop" onClick={() => setFoldersOpen(false)}>
          <div
            className="card foldersOverlayCard"
            role="dialog"
            aria-modal="true"
            aria-label="Folders"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="menuSectionTitle">Folders</div>
              <button className="btn" onClick={() => setFoldersOpen(false)} type="button">Close</button>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <label className="menuControlLabel">
                <span className="muted" style={{ fontSize: 13 }}>Sort</span>
                <select
                  className="btn menuControlSelect"
                  value={folderSortOrder}
                  onChange={(e) => setFolderSortOrder(e.target.value as SortOrder)}
                >
                  <option value="recent">Recent</option>
                  <option value="az">A - Z</option>
                </select>
              </label>
              <label className="menuControlLabel">
                <span className="muted" style={{ fontSize: 13 }}>Filter</span>
                <select
                  className="btn menuControlSelect"
                  value={folderFilterStatus}
                  onChange={(e) => setFolderFilterStatus(e.target.value as FilterStatus)}
                >
                  <option value="all">All</option>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="complete">Complete</option>
                </select>
              </label>
            </div>

            <div className="row folderBreadcrumbRow" style={{ marginTop: 10 }}>
              <button
                className={`btn ${activeFolderId === null ? "primary" : ""}`}
                onClick={() => setActiveFolderId(null)}
                type="button"
              >
                Top Level
              </button>
              {activeFolderTrail.map((folder) => (
                <button
                  key={folder.id}
                  className={`btn ${activeFolderId === folder.id ? "primary" : ""}`}
                  onClick={() => setActiveFolderId(folder.id)}
                  type="button"
                >
                  {folder.name}
                </button>
              ))}
            </div>

            <div className="menuPuzzleList" style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 13 }}>
                {activeFolder ? buildFolderPath(activeFolder, folderById) : "Top-level folders"}
              </div>

              {visibleChildFolders.map((folder) => {
                const childCount = folderChildCounts.get(folder.id) ?? 0;
                const puzzleCount = folder.puzzleKeys.length;
                return (
                  <button
                    key={folder.id}
                    className="card folderBrowserItem"
                    onClick={() => setActiveFolderId(folder.id)}
                    type="button"
                  >
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div className="row" style={{ gap: 6 }}>
                        <IconFolder />
                        <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{folder.name}</div>
                      </div>
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {puzzleCount} puzzle{puzzleCount === 1 ? "" : "s"} | {childCount} subfolder{childCount === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })}

              {activeFolder ? (
                <>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Puzzles in this folder</div>
                  {visibleFolderPuzzles.map((row) => (
                    <button
                      key={`${activeFolder.id}-${row.key}`}
                      className="card folderPuzzleItem"
                      onClick={() => openPuzzle(row.key)}
                      type="button"
                    >
                      <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{row.def?.meta?.title || "(untitled)"}</div>
                      {row.def?.meta?.author ? (
                        <div className="muted" style={{ fontSize: 13 }}>{row.def.meta.author}</div>
                      ) : null}
                      <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
                        <div>{fmtHMS(row.progress?.totalMillis ?? 0)}</div>
                        <div className="muted" style={{ fontSize: 13 }}>{statusLabel(puzzleStatus(row))}</div>
                      </div>
                    </button>
                  ))}
                  {!visibleFolderPuzzles.length ? (
                    <div className="muted" style={{ marginTop: 2 }}>
                      {folderFilterStatus === "all"
                        ? "This folder has no puzzles yet."
                        : "No puzzles in this folder match the current filter."}
                    </div>
                  ) : null}
                </>
              ) : null}

              {!visibleChildFolders.length && !activeFolder ? (
                <div className="muted">No folders yet. Create one below.</div>
              ) : null}
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700 }}>Create folder</div>
              <div className="row" style={{ marginTop: 8 }}>
                <input
                  className="url"
                  placeholder="Folder name"
                  value={folderCreateName}
                  onChange={(event) => setFolderCreateName(event.target.value)}
                />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <label className="menuControlLabel" style={{ flex: "1 1 220px" }}>
                  <span className="muted" style={{ fontSize: 13 }}>Parent</span>
                  <select
                    className="btn menuControlSelect"
                    value={folderCreateParentId}
                    onChange={(event) => setFolderCreateParentId(event.target.value)}
                  >
                    <option value={CURRENT_FOLDER_OPTION}>Current Folder</option>
                    <option value={ROOT_FOLDER_OPTION}>Top Level</option>
                    {folderPathOptions.map(({ folder, path }) => (
                      <option key={`create-parent-${folder.id}`} value={folder.id}>{path}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn primary"
                  onClick={() => {
                    void onCreateFolderFromFoldersMenu();
                  }}
                  disabled={!folderCreateName.trim() || !!folderCreateBusy}
                  type="button"
                >
                  Create
                </button>
              </div>
              {folderCreateBusy ? <div className="muted" style={{ marginTop: 8 }}>{folderCreateBusy}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {addToFolderPuzzle ? (
        <div className="overlayBackdrop" onClick={() => setAddToFolderPuzzle(null)}>
          <div
            className="card folderPickerCard"
            role="dialog"
            aria-modal="true"
            aria-label="Add puzzle to folder"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div className="menuSectionTitle">Add to folder</div>
              <button className="btn" onClick={() => setAddToFolderPuzzle(null)} type="button">Close</button>
            </div>
            <div className="muted" style={{ marginTop: 4, overflowWrap: "anywhere" }}>
              {addToFolderPuzzle.def?.meta?.title || "(untitled)"}
            </div>

            <div className="menuPuzzleList" style={{ marginTop: 12 }}>
              {folderPathOptions.map(({ folder, path }) => {
                const alreadyAdded = selectedPuzzleFolderIds.has(folder.id);
                return (
                  <button
                    key={`picker-${folder.id}`}
                    className="btn menuFolderPickButton"
                    onClick={() => {
                      void onAddPuzzleToExistingFolder(folder.id);
                    }}
                    disabled={alreadyAdded || !!addToFolderBusy}
                    type="button"
                  >
                    <span className="menuFolderPathText">{path}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {alreadyAdded ? "Already added" : "Add"}
                    </span>
                  </button>
                );
              })}
              {!folderPathOptions.length ? (
                <div className="muted">No folders yet. Create one below.</div>
              ) : null}
            </div>

            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700 }}>Create new folder</div>
              <div className="row" style={{ marginTop: 8 }}>
                <input
                  className="url"
                  placeholder="Folder name"
                  value={addFolderName}
                  onChange={(event) => setAddFolderName(event.target.value)}
                />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <label className="menuControlLabel" style={{ flex: "1 1 220px" }}>
                  <span className="muted" style={{ fontSize: 13 }}>Parent</span>
                  <select
                    className="btn menuControlSelect"
                    value={addFolderParentId}
                    onChange={(event) => setAddFolderParentId(event.target.value)}
                  >
                    <option value={ROOT_FOLDER_OPTION}>Top Level</option>
                    {folderPathOptions.map(({ folder, path }) => (
                      <option key={`add-parent-${folder.id}`} value={folder.id}>{path}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn primary"
                  onClick={() => {
                    void onCreateFolderAndAddPuzzle();
                  }}
                  disabled={!addFolderName.trim() || !!addToFolderBusy}
                  type="button"
                >
                  Create + Add
                </button>
              </div>
            </div>

            {addToFolderBusy ? <div className="muted" style={{ marginTop: 10 }}>{addToFolderBusy}</div> : null}
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

      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
