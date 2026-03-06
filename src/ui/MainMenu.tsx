import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadFromSudokuPad } from "../core/sudokupad";
import { deletePuzzle, listPuzzles, upsertPuzzle } from "../core/storage";
import { makeInitialProgress } from "../core/scl";
import { fmtHMS } from "../core/time";
import { firebaseEnabled, googleLogin, googleLogout } from "../firebase/client";
import { IconSettings } from "./icons";
import { SettingsOverlay } from "./SettingsOverlay";

export function MainMenu() {
  const nav = useNavigate();
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<Array<Awaited<ReturnType<typeof listPuzzles>>[number]>>([]);
  const [busy, setBusy] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function refresh() {
    setRows(await listPuzzles());
  }
  useEffect(() => { refresh(); }, []);

  const totals = useMemo(() => {
    const ms = rows.reduce((a, r) => a + (r.progress?.totalMillis ?? 0), 0);
    return fmtHMS(ms);
  }, [rows]);

  async function onLoad() {
    setBusy("Loading puzzle…");
    try {
      const { key, def } = await loadFromSudokuPad(url);
      const progress = makeInitialProgress(def);
      await upsertPuzzle(key, { def, progress, undo: [], redo: [], updatedAt: Date.now() });
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
              <div className="muted">{rows.length} total</div>
            </div>

            <div className="menuPuzzleList">
              {rows.map((r) => (
                <div
                  key={r.key}
                  className="card menuPuzzleRow"
                  onClick={() => nav(`/p/${encodeURIComponent(r.key)}`)}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {r.def?.meta?.title || "(untitled)"}{" "}
                      <span className="muted" style={{ fontWeight: 500 }}>
                        {r.def?.meta?.author ? `- ${r.def.meta.author}` : ""}
                      </span>
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>{r.key}</div>
                  </div>

                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <div>{fmtHMS(r.progress?.totalMillis ?? 0)}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {r.progress?.status ?? "not_started"}
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
              ))}
              {!rows.length && <div className="muted">No puzzles loaded yet.</div>}
            </div>
          </div>
        </div>
      </div>

      {settingsOpen ? <SettingsOverlay onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}