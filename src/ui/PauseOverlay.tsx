import { useCallback, useEffect } from "react";
import type { PuzzleDefinition, PuzzleMeta } from "../core/model";
import { makeInitialProgress } from "../core/scl";
import { GridCanvas } from "./GridCanvas";

export function PauseOverlay(props: {
  def: PuzzleDefinition;
  meta?: PuzzleMeta;
  sourceId?: string;
  started: boolean;
  onStart: () => void;
  onResume: () => void;
  onStayPaused: () => void;
  onRestart: () => void;
}) {
  const { def, meta, started, onResume, onStart } = props;
  const clean = (value: string | null | undefined) => (value ?? "").trim();
  const formatDurationHm = (seconds: number | null | undefined): string => {
    if (seconds == null || seconds < 0) return "~";
    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${minutes}m`;
    if (minutes <= 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  const SUDOKUPAD_ICON_URL = "https://sudokupad.app/images/sudokupad_square_logo.png";
  const YOUTUBE_ICON_DATA_URL =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='1' y='4' width='22' height='16' rx='4' fill='%23ff0000'/%3E%3Cpolygon points='10,8 17,12 10,16' fill='white'/%3E%3C/svg%3E";

  const display = (value: string | null | undefined) => clean(value) || "~";
  const constraints = Array.isArray(meta?.archiveConstraints) ? meta.archiveConstraints.filter(Boolean) : [];
  const collection = clean(meta?.collection);
  const fallbackSudokuPadPath = (props.sourceId ?? "").trim().replace(/^\/+/, "");
  const sudokuPadUrl = clean(meta?.archiveSudokuPadUrl) || (fallbackSudokuPadPath ? `https://sudokupad.app/${encodeURI(fallbackSudokuPadPath)}` : "");
  const youtubeUrl = clean(meta?.archiveYouTubeUrl);

  const onBackdropClick = useCallback(() => {
    if (started) onResume();
    else onStart();
  }, [onResume, onStart, started]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onBackdropClick();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBackdropClick]);

  return (
    <div className="overlayBackdrop" onClick={onBackdropClick}>
      <div className="card" role="dialog" aria-modal="true" aria-label="Pause menu" onClick={(e) => e.stopPropagation()} style={{ width: "min(860px, 100%)", maxHeight: "min(92dvh, calc(100vh - 24px))", overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
          <div style={{ fontWeight: 800, fontSize: 22, minWidth: 0, overflowWrap: "anywhere" }}>{meta?.title || "(untitled)"}</div>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>{meta?.author || ""}</div>
        <div className="archiveRulesPreview" style={{ marginTop: 12 }} aria-label="Puzzle preview">
          <GridCanvas
            def={def}
            progress={makeInitialProgress(def)}
            onSelection={() => {}}
            onLineStroke={() => {}}
            onLineTapCell={() => {}}
            onLineTapEdge={() => {}}
            onDoubleCell={() => {}}
            interactive={false}
            previewMode
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Instructions</div>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
            {meta?.rules || "No instructions found in metadata."}
          </div>
          {typeof meta?.solveCount === "number" ? (
            <div className="muted" style={{ marginTop: 10 }}>SudokuPad solves: {meta.solveCount.toLocaleString()}</div>
          ) : null}
        </div>

        <div className="card archiveEntryCard" style={{ marginTop: 12 }}>
          <div className="archiveEntryHead">
            <div className="archiveEntryMain archiveDetailsGrid">
              {sudokuPadUrl ? (
                <a
                  className="btn archiveOpenIcon archiveSudokuPadIcon"
                  href={sudokuPadUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Open SudokuPad"
                  aria-label="Open SudokuPad"
                >
                  <img src={SUDOKUPAD_ICON_URL} alt="" className="archiveIconImage" />
                </a>
              ) : (
                <button
                  type="button"
                  className="btn archiveOpenIcon archiveSudokuPadIcon"
                  disabled
                  title="Open SudokuPad"
                  aria-label="Open SudokuPad"
                >
                  <img src={SUDOKUPAD_ICON_URL} alt="" className="archiveIconImage" />
                </button>
              )}

              <div className="archiveInfoText archivePuzzleInfo">
                <div className="archiveEntryTitle">
                  {display(meta?.title)}
                  {collection ? (
                    <span className="archiveEntryCollection">
                      {" "}
                      (Collection: {collection})
                    </span>
                  ) : null}
                </div>

                <div className="archiveMetaSmall">{display(meta?.author)}</div>

                {constraints.length ? (
                  <ul className="archiveConstraintList">
                    {constraints.map((constraint, index) => (
                      <li key={`pause-${index}-${constraint}`}>{constraint}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="archiveMetaMedium">~</div>
                )}
              </div>

              {youtubeUrl ? (
                <a
                  className="btn archiveOpenIcon archiveYoutubeIcon"
                  href={youtubeUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  title="Open YouTube"
                  aria-label="Open YouTube"
                >
                  <img src={YOUTUBE_ICON_DATA_URL} alt="" className="archiveIconImage" />
                </a>
              ) : (
                <button
                  type="button"
                  className="btn archiveOpenIcon archiveYoutubeIcon"
                  disabled
                  title="Open YouTube"
                  aria-label="Open YouTube"
                >
                  <img src={YOUTUBE_ICON_DATA_URL} alt="" className="archiveIconImage" />
                </button>
              )}

              <div className="archiveInfoText archiveVideoInfo">
                <div className="archiveVideoTitle">{display(meta?.archiveVideoTitle)}</div>
                <div className="archiveMetaSmall">{display(meta?.archiveVideoDate)}</div>
                <div className="archiveMetaMedium">
                  {formatDurationHm(meta?.archiveVideoLengthSeconds)} - {display(meta?.archiveVideoHost)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {!started ? (
          <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={props.onStart}>
            Start
          </button>
        ) : (
          <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn primary" style={{ flex: 1, minWidth: 0 }} onClick={props.onResume}>
              Resume
            </button>
            <button className="btn" style={{ flex: 1, minWidth: 0 }} onClick={props.onStayPaused}>
              Stay paused
            </button>
            <button className="btn" style={{ flex: 1, minWidth: 0 }} onClick={props.onRestart}>
              Restart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
