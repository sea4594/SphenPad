import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadFromSudokuPad } from "../core/sudokupad";
import { deletePuzzle, listPuzzles, upsertPuzzle } from "../core/storage";
import { makeInitialProgress } from "../core/scl";
import { fmtHMS } from "../core/time";
import { firebaseEnabled, googleLogin, googleLogout } from "../firebase/client";
import { GridCanvas } from "./GridCanvas";
import { IconSettings } from "./icons";
import { SettingsOverlay } from "./SettingsOverlay";

type SortOrder = "recent" | "az";
type FilterStatus = "all" | "not_started" | "in_progress" | "complete";
type StoredPuzzle = Awaited<ReturnType<typeof listPuzzles>>[number];

const NOOP = () => {};

function summarizeConstraints(rules: string | undefined): string {
  const source = (rules ?? "").replace(/\s+/g, " ").trim();
  if (!source) return "No constraints listed.";

  const cleaned = source
    .replace(/normal\s+sudoku\s+rules\s+apply\.?/gi, "")
    .replace(/^(rules?|constraints?)\s*[:\-]\s*/i, "")
    .trim();

  const text = cleaned || source;
  const parts = text
    .split(/[.;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, 2).join("; ") || text;
}

export function MainMenu() {
  const nav = useNavigate();
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<StoredPuzzle[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  async function refresh() {
    setRows(await listPuzzles());
  }
  useEffect(() => { refresh(); }, []);

  const totals = useMemo(() => {
    const ms = rows.reduce((a, r) => a + (r.progress?.totalMillis ?? 0), 0);
    return fmtHMS(ms);
  }, [rows]);

  const displayRows = useMemo(() => {
    let result = [...rows];

    if (filterStatus !== "all") {
      result = result.filter((r) => (r.progress?.status ?? "not_started") === filterStatus);
    }

    if (sortOrder === "recent") {
      result.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sortOrder === "az") {
      result.sort((a, b) => {
        const ta = (a.def?.meta?.title ?? "").toLowerCase();
        const tb = (b.def?.meta?.title ?? "").toLowerCase();
        if (!ta && tb) return 1;
        if (ta && !tb) return -1;
        return ta.localeCompare(tb);
      });
    }

    return result;
  }, [rows, sortOrder, filterStatus]);

  async function onLoad() {
    setBusy("Loading puzzle…");
    try {
      const { key, def } = await loadFromSudokuPad(url);
      const progress = makeInitialProgress(def);
      const now = Date.now();
      await upsertPuzzle(key, { def, progress, undo: [], redo: [], updatedAt: now, createdAt: now });
      await refresh();
      nav(`/p/${encodeURIComponent(key)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(msg);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">SphenPad</div>
        <div className="muted">Total time: {totals}</div>
        <div className="spacer" />
        <button className="btn" onClick={() => setSettingsOpen(true)} title="Settings">
          <IconSettings />
        </button>
        {firebaseEnabled ? (
          <div className="row">
            <button className="btn" onClick={() => googleLogin().catch((e)=>alert(e.message))}>Google login</button>
            <button className="btn" onClick={() => googleLogout().catch((e)=>alert(e.message))}>Logout</button>
          </div>
        ) : (
          <div className="muted">Google sync: disabled (no env vars)</div>
        )}
      </div>

      <div className="page">
        <div className="mainMenuWrap">
          <div className="card">
            <div className="menuSectionTitle">Load Puzzle</div>
            <div className="muted" style={{ marginTop: 2 }}>Paste a `sudokupad.app` link or a puzzle id</div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => nav("/archive")}>
                Import from CtC archive
              </button>
              <input
                className="url"
                placeholder="https://sudokupad.app/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button className="btn primary" onClick={onLoad} disabled={!url || !!busy}>
                Load
              </button>
            </div>
            {busy && <div className="muted" style={{ marginTop: 10 }}>{busy}</div>}
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

            <div className="row" style={{ marginTop: 8 }}>
              <label className="menuControlLabel">
                <span className="muted" style={{ fontSize: 13 }}>Sort</span>
                <select
                  className="btn menuControlSelect"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                >
                  <option value="recent">Recent</option>
                  <option value="az">A → Z</option>
                </select>
              </label>
              <label className="menuControlLabel">
                <span className="muted" style={{ fontSize: 13 }}>Filter</span>
                <select
                  className="btn menuControlSelect"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                >
                  <option value="all">All</option>
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="complete">Complete</option>
                </select>
              </label>
            </div>

            <div className="menuPuzzleList">
              {displayRows.map((r) => {
                const previewProgress = {
                  ...r.progress,
                  selection: [],
                  multiSelect: false,
                };
                const constraintsSummary = summarizeConstraints(r.def?.meta?.rules);

                return (
                  <div
                    key={r.key}
                    className="card menuPuzzleRow"
                    onClick={() => nav(`/p/${encodeURIComponent(r.key)}`)}
                  >
                    <div className="menuPuzzleSummary">
                      <div className="menuPuzzleTitleWrap">
                        <div className="menuPuzzleTitle">{r.def?.meta?.title || "(untitled)"}</div>
                        {r.def?.meta?.author ? (
                          <div className="muted menuPuzzleAuthor">
                            {r.def.meta.author}
                          </div>
                        ) : null}
                        <div className="muted menuPuzzleConstraints">
                          {constraintsSummary}
                        </div>
                      </div>

                      <div className="row menuPuzzleMeta">
                        <div>{fmtHMS(r.progress?.totalMillis ?? 0)}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {r.progress?.status ?? "not_started"}
                        </div>
                      </div>
                    </div>

                    <div className="menuPuzzleDeleteStack">
                      <div className="menuPuzzlePreview" aria-hidden="true">
                        <GridCanvas
                          def={r.def}
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

                      <button
                        className="btn danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePuzzle(r.key).then(refresh);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
              {!displayRows.length && (
                <div className="muted">
                  {filterStatus !== "all" ? "No puzzles match the current filter." : "No puzzles loaded yet."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
