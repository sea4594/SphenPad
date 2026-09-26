# Phase 11B — Project management + persistent creator storage

Date: 2026-09-24
Status: COMPLETE

## Scope completed

Phase 11B makes the Phase 11A `CreatorProject` model a first-class persisted project type instead of discovering creator projects by filtering ordinary solver puzzle saves.

### First-class creator persistence

- Added IndexedDB `creatorProjects` table (Dexie schema v3).
- Each row stores the normalized `CreatorProject`, `createdAt`, content `updatedAt`, `savedAt`, `lastOpenedAt`, and an optional synced `deletedAt` tombstone.
- Existing Phase 10D/11A creator puzzles are lazily migrated from their existing persisted puzzle rows into `CreatorProject` rows.
- A derived `PuzzleDefinition`/solver row is maintained for the current Phase 1–10 preview/player route. The native runtime/renderer architecture is unchanged.

### Project lifecycle

Implemented creator-project operations:

- New
- Open
- Duplicate
- Rename
- Delete
- Recent-project ordering by `lastOpenedAt`

Duplicate assigns a new project/source identity and preserves the complete creator authoring payload. Delete removes the compatibility solver row and uses a creator-project tombstone so an older cloud copy cannot resurrect the project.

### Editor persistence UX

- Editor loads directly from `CreatorProject` storage.
- Editing marks the project dirty immediately.
- Autosave runs after 700 ms of edit inactivity.
- Manual **Save** is available in the creator top bar.
- Save state is visible as `Saved`, `Unsaved changes`, or `Saving…`.
- Browser unload receives the normal unsaved-change warning while dirty.
- Exit, Share, and current Playtest flush unsaved edits before navigating/launching.
- Title, author, rules, completion message, and all existing creator data now persist through the first-class project record.

### Local/account sync

Creator projects are included in the existing SphenPad snapshot and Firebase account-sync flow as a separate `creatorProjects` collection.

Merge behavior:

- project content is selected by newest content `updatedAt`;
- `lastOpenedAt` is merged independently so merely opening an older copy cannot replace newer edits;
- delete tombstones suppress stale compatibility puzzle rows and win over older edits;
- an actual edit newer than a tombstone can intentionally restore the project.

This retains the existing revision-conflict/reconcile behavior used by SphenPad account sync.

## Main files

- `src/sudokupad/creator/projectStorage.ts`
- `src/core/storage.ts`
- `src/core/appState.ts`
- `src/firebase/client.ts`
- `src/app/accountSync.tsx`
- `src/ui/PuzzleCreatorPage.tsx`
- `src/ui/PuzzleEditorPage.tsx`
- `scripts/test-creator-project-storage.ts`

## Architectural boundary retained

`CreatorProject` is the persisted authoring source of truth. `PuzzleDefinition + SudokuPadScene + PuzzleLogic` remains the runtime bridge for the existing renderer/player. Phase 11B does not introduce a parallel renderer or replace Phase 1–10 play behavior.
