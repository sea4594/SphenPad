import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { puzzleToCloudPayload } from "../src/core/puzzleSync";
import type { PersistedPuzzle } from "../src/core/model";

const puzzle = {
  def: { meta: {}, rows: 1, cols: 1, size: 1, givens: [] },
  progress: {
    startedAt: 1, totalMillis: 1234, status: "in_progress", videoResumeSeconds: 42,
    selection: [{ r: 0, c: 0 }], multiSelect: true,
    cells: [[{ value: "1", notes: {} }]], lines: [], lineCenterMarks: [], lineEdgeMarks: [],
    entryMode: "corner", alphabetMode: true, alphabetPage: 1,
    highlightPalettePage: 1, activeHighlightColor: "#fff", linePaletteColor: "#000", linePaletteKind: "center",
    lineDoubleMode: true, activeTool: "line", storedSelectionWhenLineTool: [{ r: 0, c: 0 }], paused: true,
  },
  undo: [{ important: "keep" }], redo: [{ important: "keep-too" }], updatedAt: 10, createdAt: 1,
} as unknown as PersistedPuzzle;
const payload = puzzleToCloudPayload("p", puzzle);
assert.deepEqual(payload.undo, puzzle.undo, "undo history must remain cloud-synced");
assert.deepEqual(payload.redo, puzzle.redo, "redo history must remain cloud-synced");
assert.equal("selection" in payload.progress, false, "selection is device/session state");
assert.equal("activeTool" in payload.progress, false, "active tool is device/session state");
assert.equal("paused" in payload.progress, false, "pause UI state is device/session state");
assert.equal(payload.progress.totalMillis, 1234);
assert.equal(payload.progress.videoResumeSeconds, 42);

const firebaseSource = readFileSync(new URL("../src/firebase/client.ts", import.meta.url), "utf8");
assert.match(firebaseSource, /MAX_WRITES_PER_COMMIT = 75/);
assert.match(firebaseSource, /MAX_ESTIMATED_COMMIT_BYTES = 5 \* 1024 \* 1024/);
assert.doesNotMatch(firebaseSource, /MAX_BATCH_SIZE = 400/);

assert.match(firebaseSource, /SYNC_PAYLOAD_ENCODING_LZ/, "large cloud records should use compressed payloads when smaller");
assert.match(firebaseSource, /onCloudStateChanged/, "cross-device revision changes should be observable immediately");
assert.match(firebaseSource, /await chunkChangesYielding\(changes\)/, "bulk cloud encoding should yield between records");

assert.match(firebaseSource, /syncRevision/);
assert.match(firebaseSource, /CLOUD_SCHEMA_VERSION = 3/);
assert.match(firebaseSource, /syncPuzzles/);
assert.match(firebaseSource, /syncFolders/);
assert.match(firebaseSource, /syncCreatorProjects/);
assert.match(firebaseSource, /migrateCloudToCurrentSchema/);
assert.match(firebaseSource, /deleteField\(\)/);
assert.match(firebaseSource, /cloud-schema-migration-required/);
const accountSource = readFileSync(new URL("../src/app/accountSync.tsx", import.meta.url), "utf8");
assert.match(accountSource, /readSyncDirtyRecords/);
assert.match(accountSource, /authEpochRef/);
assert.match(accountSource, /runExclusive/);
assert.match(accountSource, /readLocalMutationRevision/);
assert.match(accountSource, /migrateCloudToCurrentSchema/);
assert.match(accountSource, /useState\(true\)/, "same-account launch must not wait on cloud sync");
assert.match(accountSource, /if \(switchingAccounts\) \{ readyRef\.current = false; setReady\(false\); \}/, "only account switching should gate local UI");
assert.match(accountSource, /Logout cancelled because some local changes could not be synced/);

const storageSource = readFileSync(new URL("../src/core/storage.ts", import.meta.url), "utf8");
assert.match(storageSource, /markSyncDirty\("puzzle", key, updatedAt, false\)/, "normal puzzle deletion must leave a cloud tombstone");
assert.match(storageSource, /options: \{ sync\?: boolean \} = \{\}/, "local autosave must be separable from cloud dirtying");
assert.match(storageSource, /supersede\("puzzle", change.key\)/, "remote winners must clear only superseded dirty puzzle mutations");
assert.match(storageSource, /updatePuzzleListCache\(key, data\)/, "single-puzzle autosaves must not invalidate the full puzzle-list cache");

assert.match(storageSource, /Keep the hot puzzle-list cache intact/, "one remote puzzle must not invalidate the entire hydrated library");

const puzzlePageSource = readFileSync(new URL("../src/ui/PuzzlePage.tsx", import.meta.url), "utf8");
assert.match(puzzlePageSource, /5_000/, "active puzzle progress should autosave locally");
assert.match(puzzlePageSource, /30_000/, "background cloud progress should be coalesced");
assert.match(puzzlePageSource, /backgroundProgressDirtyRef/, "timer/video-only progress should use the lightweight background path");

assert.match(puzzlePageSource, /applySessionPatches/, "selection/tool/pause UI changes should remain local-only");
assert.match(puzzlePageSource, /touchUpdatedAt: false/, "session-only changes must not win cloud conflict resolution");
assert.doesNotMatch(puzzlePageSource, /if \(!creatorPlaytest\) await upsertPuzzle\(key, normalized\)/, "opening a puzzle must not create a no-op write/sync");
assert.match(puzzlePageSource, /status === "complete"\) \{\s*setPauseMenuOpen\(true\)/s, "completed puzzles must still open the pause menu");

const themeSource = readFileSync(new URL("../src/app/theme.tsx", import.meta.url), "utf8");
assert.match(themeSource, /highlightTransparency/);
assert.match(themeSource, /setSyncedLocalStorageItem\(STORAGE_KEY/, "highlight transparency should stay in the device-local theme record");

const appStateSource = readFileSync(new URL("../src/core/appState.ts", import.meta.url), "utf8");
assert.match(appStateSource, /localStorage: \{\}/, "theme and view preferences must remain device-local");

assert.match(accountSource, /LOCAL_MUTATION_CHECKPOINT_KEY_PREFIX/, "sync must recover if the localStorage dirty journal disappears");
assert.match(accountSource, /recoverMissingDirtyJournal/, "missing dirty journal must be rebuilt from IndexedDB keys");
assert.match(accountSource, /recoverMissingDirtyJournal\(uid, true\)/, "login with local data must protect every IndexedDB record before cloud replay");
assert.match(accountSource, /cloudRevisionRef\.current = 0; saveRevision\(uid, 0\);[\s\S]*await applyIncrementalCloud/, "login with local data must reconcile from revision zero instead of trusting a stale cursor");
assert.match(accountSource, /queueCreatorDependencyRepairs/, "login should republish creator projects and creator puzzle progress to heal old orphans");
assert.match(accountSource, /payload\.creatorProjectKey[\s\S]*kind: "creatorProject"/, "creator puzzle progress must upload its creator-project dependency");
assert.match(accountSource, /payload\.def = row!\.data\.def/, "creator puzzles need an inline definition fallback if their project row is missing");
assert.match(firebaseSource, /readCreatorProjectDependency/, "cloud pulls must repair missing creator dependencies from current or legacy storage");
assert.match(firebaseSource, /Skipping cloud puzzle .*definition dependency is unavailable/, "one orphan puzzle must not abort the entire cloud restore");
assert.match(storageSource, /dirty\?\.deletedAt && dirty\.deletedAt >= change\.updatedAt/, "newer local puzzle deletes must survive stale remote updates");
assert.match(storageSource, /localUpdatedAt > change\.updatedAt/, "newer dirty local progress must survive stale remote deletes");
assert.match(storageSource, /Skipping cloud puzzle \$\{change\.key\}/, "an orphan incremental puzzle must be quarantined instead of aborting all sync");
console.log("Account sync regression checks passed.");
