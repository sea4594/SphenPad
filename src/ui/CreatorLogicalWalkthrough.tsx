import { useState } from "react";
import type { CellRC, PuzzleDefinition } from "../core/model";
import type { CreatorLogicalFrame, CreatorLogicalResult } from "../sudokupad/creator/solver";

type Props = {
  def: PuzzleDefinition;
  result: CreatorLogicalResult;
  onSelectCell?: (rc: CellRC) => void;
};
const cellKey = (rc: CellRC) => `${rc.r}:${rc.c}`;
const label = (rc: CellRC) => `R${rc.r + 1}C${rc.c + 1}`;

/** Read-only creator analysis: never modifies a project, progress, or renderer. */
export function CreatorLogicalWalkthrough({ def, result, onSelectCell }: Props) {
  const [index, setIndex] = useState(0);
  const [showCandidates, setShowCandidates] = useState(true);
  const frames: CreatorLogicalFrame[] = result.frames ?? [{ values: result.values, candidates: [] }];
  const maxIndex = Math.min(result.steps.length, frames.length - 1);
  const activeIndex = Math.min(index, maxIndex);
  const frame = frames[activeIndex];
  const step = activeIndex ? result.steps[activeIndex - 1] : null;
  const digits = new Map(frame.values.map(({ rc, value }) => [cellKey(rc), value]));
  const candidates = new Map(frame.candidates.map(({ rc, values }) => [cellKey(rc), values]));
  const eliminated = new Set((step?.eliminations ?? []).map(({ rc }) => cellKey(rc)));
  const focused = new Set((step?.focusCells ?? []).map(cellKey));
  if (step?.kind !== "eliminate" && step) focused.add(cellKey(step.rc));
  const counts = Object.entries(result.difficulty?.techniques ?? {}).filter(([, count]) => Boolean(count));
  const minCell = def.cols > 16 ? 22 : def.cols > 9 ? 29 : def.cols > 6 ? 37 : 45;

  return <section className="creatorFileSection" aria-label="Logical solving walkthrough">
    <h4>Logical walkthrough</h4>
    <div className="creatorHelp" role="status">
      <strong>{result.status === "solved" ? "Completed with supported logic" : result.status === "stuck" ? "Supported logic stopped" : result.status === "invalid" ? "Invalid deductions or grid" : "Unsupported constraint"}</strong>
      {` · ${result.steps.length} step${result.steps.length === 1 ? "" : "s"}`}
      {result.message ? ` · ${result.message}` : ""}
    </div>
    {result.difficulty ? <div className="creatorHelp">
      <strong>Technique-based difficulty:</strong> {result.difficulty.level === "unrated" ? "Unrated" : result.difficulty.level}
      {result.difficulty.hardestTechnique ? ` (hardest: ${result.difficulty.hardestTechnique})` : ""}
      {counts.length ? <div>Techniques: {counts.map(([name, count]) => `${name} × ${count}`).join("; ")}</div> : null}
      <div>{result.difficulty.note}</div>
    </div> : null}
    {frames.length ? <>
      <div className="creatorFileActions" role="group" aria-label="Logical step navigation">
        <button type="button" className="btn" disabled={activeIndex === 0} onClick={() => setIndex(0)}>Start</button>
        <button type="button" className="btn" disabled={activeIndex === 0} onClick={() => setIndex((at) => Math.max(0, at - 1))}>Previous</button>
        <button type="button" className="btn primary" disabled={activeIndex === maxIndex} onClick={() => setIndex((at) => Math.min(maxIndex, at + 1))}>Next step</button>
        <button type="button" className="btn" disabled={activeIndex === maxIndex} onClick={() => setIndex(maxIndex)}>End</button>
      </div>
      <div className="creatorHelp" aria-live="polite">
        <strong>Step {activeIndex} of {maxIndex}</strong>
        {step ? <div><strong>{step.reason}</strong>{step.kind === "eliminate" ? ` — ${step.eliminations?.length ?? 0} candidate elimination${step.eliminations?.length === 1 ? "" : "s"}` : ` — ${label(step.rc)} = ${step.value}`}{step.explanation ? <div>{step.explanation}</div> : null}</div>
          : <div>Starting grid: givens and available candidates, before any logical deductions.</div>}
      </div>
      <label className="creatorToggle"><input type="checkbox" checked={showCandidates} onChange={(event) => setShowCandidates(event.target.checked)} />Show remaining candidates</label>
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <div role="grid" aria-label="Read-only logical analysis grid" style={{ display: "grid", gridTemplateColumns: `repeat(${def.cols}, minmax(${minCell}px, 1fr))`, width: "max-content", maxWidth: "100%", border: "2px solid var(--text, #777)" }}>
          {Array.from({ length: def.rows * def.cols }, (_, position) => {
            const rc = { r: Math.floor(position / def.cols), c: position % def.cols }, k = cellKey(rc);
            const value = digits.get(k), choices = candidates.get(k) ?? [], given = def.givens.some((g) => cellKey(g.rc) === k);
            const active = focused.has(k), changed = eliminated.has(k);
            return <button key={k} type="button" role="gridcell" onClick={() => onSelectCell?.(rc)} title={`${label(rc)}${value !== undefined ? ` = ${value}` : `: candidates ${choices.join(", ") || "none"}`}`}
              aria-label={`${label(rc)} ${value !== undefined ? `value ${value}` : `candidates ${choices.join(", ") || "none"}`}${changed ? ", eliminated candidate here" : ""}`}
              style={{ minWidth: minCell, minHeight: minCell, maxWidth: def.cols > 9 ? minCell + 6 : 58, border: "1px solid var(--border, #888)", borderRightWidth: rc.c === def.cols - 1 ? 1 : 1, borderRadius: 0, display: "grid", placeItems: "center", padding: "2px", background: changed ? "#ffe6df" : active ? "#dceafa" : "transparent", color: changed || active ? "#1e3658" : "inherit", cursor: "pointer", fontWeight: given ? 700 : 500, fontSize: value !== undefined ? "1rem" : "0.55rem", lineHeight: 1.1, overflowWrap: "anywhere", textAlign: "center" }}>
              {value !== undefined ? value : showCandidates ? choices.join(" ") : ""}
            </button>;
          })}
        </div>
      </div>
      {step?.eliminations?.length ? <div className="creatorHelp">Removed: {step.eliminations.map(({ rc, value }) => `${value} at ${label(rc)}`).join(", ")}</div> : null}
    </> : null}
    <div className="creatorHelp">Analysis only: stepping through deductions does not change puzzle givens, the authored solution, or saved progress. A logical dead end is not proof of unsolvability.</div>
  </section>;
}
