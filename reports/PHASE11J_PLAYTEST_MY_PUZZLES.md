# Phase 11J — Real SphenPad Playtest + My Puzzles

Phase 11J connects CreatorProject authoring to the existing SphenPad solve lifecycle without introducing a second player.

## Real playtest

- Creator **Playtest** now navigates to the normal `/p/:puzzleId` `PuzzlePage` with an explicit `creatorPlaytest=1` mode.
- Playtest starts from a fresh `makeInitialProgress` solve state and uses the normal SphenPad puzzle controls, checker, timer, pause/restart, completion UI, settings, and renderer.
- Playtest edits, timer, undo/redo, and status are intentionally in-memory only. They do not overwrite the authored CreatorProject or the puzzle's normal My Puzzles solve progress.
- Returning with **← Creator** restores the same creator project plus selection, active creator tab, active element/object, authoring state, active input tool, alphabet/highlight page, and line-tool settings passed through route state.
- Creator puzzles use the Phase 11I SCL exporter when the puzzle page copies a SudokuPad link instead of constructing an invalid `creator-*` SudokuPad URL.

## My Puzzles integration

- Every saved CreatorProject continues to maintain its normal compatibility/solve puzzle row, but creator rows are no longer hidden from Home.
- Creator-owned rows are labeled **Creator · editable** and expose **Edit in Creator** on Home and folder lists.
- Opening the row itself still opens the ordinary SphenPad solver, so the same authored puzzle can be solved normally outside playtest mode.
- The creator File tab includes a **My Puzzles** action; saved creator projects appear there automatically.
- The normal puzzle page for a creator-owned puzzle includes an **Edit** action back into Creator.

## Separate authored and solve state

`saveCreatorProject` no longer recreates the compatibility puzzle row with blank progress on every authoring save. The solve record is rebased onto the newest authored definition:

- metadata/cosmetic-only author changes preserve solve progress and undo/redo;
- new givens replace stale player values at those cells;
- out-of-bounds solve marks are cropped after resize;
- gameplay-semantic changes retain still-valid player entries but clear unsafe undo/redo and reopen completion state as needed.

This keeps CreatorProject as the authoring source of truth while My Puzzles owns ordinary solve progress and playtest owns a temporary isolated solve session.

## Rename/delete/account behavior

- Creator rename already flows through `saveCreatorProject`, so the mirrored My Puzzles title updates while normal solve progress is retained.
- Deleting a creator-owned puzzle from Home or a folder now calls `deleteCreatorProject`, not generic `deletePuzzle`.
- Therefore the existing creator deletion tombstone/account-sync path remains authoritative and stale cloud/device data cannot recreate a deleted project.
- Folder membership is cleaned by the same creator deletion transaction.

No Phase 1–10 renderer/player fork was added; 11J deliberately reuses the existing PuzzlePage and storage/account-sync paths.
