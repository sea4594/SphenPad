import { CreatorSaveCoordinator } from "../src/sudokupad/creator/saveCoordinator";
import { describeCreatorStructureLoss } from "../src/sudokupad/creator/creatorSafety";
import { createAuthoredPuzzleDefinition, syncDefinitionGivens } from "../src/sudokupad/creator/nativeAuthoring";
import { resizeCreatorDefinition, setCreatorSolutionEntries } from "../src/sudokupad/creator/gridStructure";

function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function same(actual: unknown, expected: unknown) { check(actual === expected, `${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); }
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

// Save ordering and coalescing: an older in-flight write MUST finish before the
// newest snapshot, even when undo/redo and manual flush overlap with autosave.
{
  const firstWrite = deferred();
  const started = deferred();
  const writes: string[] = [];
  let active = 0;
  const queue = new CreatorSaveCoordinator<string>(async (value) => {
    active++;
    check(active === 1, "creator writes overlapped");
    writes.push(value);
    if (value === "old") { started.resolve(); await firstWrite.promise; }
    active--;
  }, 100000);
  same(queue.enqueue("old"), 1);
  const firstFlush = queue.flush();
  await started.promise;
  queue.enqueue("middle");
  same(queue.enqueue("new"), 3);
  check(queue.getUncommitted() === "new", "queued creator edits were lost");
  const secondFlush = queue.flush();
  firstWrite.resolve();
  same(await firstFlush, 3);
  same(await secondFlush, 3);
  same(writes.join(","), "old,new");
  same(queue.getUncommitted(), null);
  same(queue.getStatus().savedRevision, 3);
}

// A rejected write retains the freshest revision, exposes an error, and can be
// retried by the editor without writing stale content after the newer snapshot.
{
  let attempts = 0;
  const writes: string[] = [];
  const queue = new CreatorSaveCoordinator<string>(async (value) => {
    attempts++;
    if (attempts === 1) throw new Error("simulated IndexedDB failure");
    writes.push(value);
  }, 100000);
  queue.enqueue("old");
  let failed = false;
  try { await queue.flush(); } catch { failed = true; }
  check(failed && queue.getStatus().error, "save failure was not reported");
  queue.enqueue("new");
  same(await queue.flush(), 2);
  same(writes.join(","), "new");
  check(!queue.getStatus().error, "retry failure state was not cleared");
}

// Destructive structural changes provide a warning for lost givens, solutions,
// constraints/regions, and cells, while same-size edits have no false positives.
{
  let def = createAuthoredPuzzleDefinition({ id: "phase1-safety", rows: 9, cols: 9, subgrid: { r: 3, c: 3 }, meta: {} });
  def = syncDefinitionGivens({ ...def, givens: [{ rc: { r: 8, c: 8 }, v: "9" }] });
  def = setCreatorSolutionEntries(def, [{ rc: { r: 8, c: 0 }, value: "2" }]);
  same(describeCreatorStructureLoss(def, def).length, 0);
  const warnings = describeCreatorStructureLoss(def, resizeCreatorDefinition(def, 7, 7));
  check(warnings.some((message) => message.includes("given")), "lost givens not reported");
  check(warnings.some((message) => message.includes("solution")), "lost solutions not reported");
  check(warnings.some((message) => message.includes("grid cells")), "removed cells not reported");
}
console.log("creator Phase 1 safety regressions passed");
