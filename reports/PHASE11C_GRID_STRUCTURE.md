# Phase 11C — Grid definition, givens, solution, digits, and regions

Phase 11C extends the first-class `CreatorProject` authoring model from 11A/11B. It does not introduce another renderer or solver path; creator projects still convert to the existing `PuzzleDefinition` + `SudokuPadScene` + `PuzzleLogic` runtime representation.

## Grid and digit structure

The creator File panel now edits rows, columns, lowest digit, highest digit, digit count, region layout, and regular box dimensions. Grid dimensions are limited to 1-30 and numeric creator digits to 1-64.

The creator can use:
- regular boxes, generated from explicit box-row/box-column dimensions;
- irregular regions, assigned directly on the board; or
- no regions.

`CreatorProject.grid.regions` persists the selected region mode and regular-box dimensions. The addition is optional and remains compatible with existing CreatorProject v1 records; older records infer their region layout from their stored regions when loaded.

## Givens and solution

Givens and solution values can be authored either directly on the board or in text-grid fields. Ordinary one-character Sudoku grids can remain compact. Multi-digit values use whitespace/comma-separated cells.

A creator solution is now also represented as per-cell `creatorSolutionEntries`. This avoids ambiguity for ranges such as 10-13 or 1-16. When all solution cells are single-character values, the existing compact `PuzzleLogic.solution` string is still maintained for compatibility.

## Resizing and clearing

Resizing preserves authored content that remains in bounds:
- givens;
- solution entries;
- region cells; and
- cosmetic scene cells.

A constraint that references any cell cropped by the resize is removed, and its tagged visuals are removed with it. A compatible regular-box layout is regenerated after resizing; otherwise a formerly regular layout becomes irregular rather than silently inventing a different box scheme.

The creator now exposes explicit clear actions for givens, solution, givens+solution, and regions.

## Structural validation

Creator validation now reports:
- dimensions outside 1-30;
- invalid digit ranges;
- givens outside the board or digit range;
- duplicate givens in rows, columns, and regions;
- out-of-bounds, duplicated, overlapping, missing, or wrong-sized region cells;
- inconsistent regular-box geometry;
- solution entries outside the board/range;
- duplicate or incomplete solutions;
- duplicate solution values in rows, columns, and regions; and
- givens that disagree with a supplied solution.

Constraint-specific semantic validation remains intentionally scoped to the constraint phases and the comprehensive SudokuMaker-equivalent validation work in Phase 11H.

## Files added/changed

- `src/sudokupad/creator/gridStructure.ts` — grid/digit/solution/region structure helpers.
- `src/sudokupad/creator/project.ts` — additive CreatorProject grid-region and multi-digit-solution persistence.
- `src/sudokupad/creator/nativeAuthoring.ts` — explicit digit-range and regular-region metadata at project creation.
- `src/sudokupad/creator/checker.ts` — expanded structural validation.
- `src/core/model.ts` — creator region-mode/box metadata.
- `src/ui/PuzzleEditorPage.tsx` — 11C authoring controls and board modes.
- `src/app/styles.css` — grid-structure panel layout.
- `scripts/test-creator-grid-structure.ts` — focused regression coverage.
