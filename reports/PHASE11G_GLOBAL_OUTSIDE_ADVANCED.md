# Phase 11G — Global / outside / indexer / custom / fog tools

Phase 11G completes the remaining SudokuMaker constraint/tool authoring families on the existing native `CreatorProject -> PuzzleDefinition -> SudokuPadScene + PuzzleLogic` path. It does not add a second renderer or solving representation.

## Global rules

Implemented first-class authoring and creator-side semantics for:

- Negative and Positive diagonals.
- Anti-King and Anti-Knight (retained as native global semantic flags and integrated with checking controls).
- Disjoint Groups.
- Nonconsecutive.
- Global Entropy with editable digit groups.
- The existing SphenPad Global Modulo-3 preset using the same grouped 2x2 semantic model.

The previously implicit SudokuMaker `SudokuRules` behavior is now an explicit **Standard row/column Sudoku rules** project setting. Disabling it turns off ordinary row/column all-different checking while leaving regions and selected variant constraints active. The setting round-trips through CreatorProject and is respected by the existing conflict checker.

## Outside clues

Added native `outside-clue` authoring for:

- Little Killers.
- Sandwich Sums.
- X-Sums.
- Skyscrapers.
- Numbered Rooms.

Outside clues store an ordered cell ray plus the numeric clue. Selecting one border cell for the orthogonal outside-clue families expands to the full inward ray; Little Killers use an explicitly selected diagonal ray. Structural diagnostics require contiguous ordered rays that begin at the board edge. Native outside clue/arrow visuals are generated and remain grouped under stable authored-object IDs.

## Indexers

Added Row Indexer and Column Indexer objects using the supplied SudokuMaker worker semantics:

- Row Indexer: the marked digit indexes a row in the marker's column, and that target cell contains the marker's row number.
- Column Indexer: the marked digit indexes a column in the marker's row, and that target cell contains the marker's column number.

Markers are selectable/editable authored objects with native underlay visuals.

## Custom constraints

Custom constraints now persist the SudokuMaker-style definition shape:

- definition name
- input schema
- input values
- component descriptors
- code backend

The editor exposes all of those fields. Arbitrary custom author code is deliberately **stored but not executed in creator mode**. Worker-equivalent custom execution/solver diagnostics remain part of Phase 11H.

## Fog

Fog Lights and Custom Fog Clearing are now first-class authored constraints rather than ad-hoc scene mutations.

- Fog Lights maintain editable initial light cells.
- Fog Triggers maintain independent trigger and reveal/effect cell sets.
- The authored constraints synchronize into the existing `scene.fog.initialLightCells`, `triggerEffects`, and `triggerLinks` representation used by the renderer/player path.
- Disabling, deleting, duplicating, or editing creator fog objects keeps the derived fog scene synchronized.
- Imported/non-creator fog is not erased merely by normalizing a project with no creator-owned fog constraints.

## Editor integration

The generic Phase 11D object inspector now exposes rule-specific controls for all 11G object families, including digit groups, outside clue values/rays, indexer cells, custom JSON/code fields, and fog trigger/effect cell sets. Singleton global rules are represented by one object and cannot be duplicated accidentally.

## Validation

Creator validation now covers:

- diagonal all-different conflicts
- disjoint-group conflicts and malformed region prerequisites
- orthogonal nonconsecutive conflicts
- Global Entropy / Modulo-3 2x2 group coverage
- Little Killer, Sandwich, X-Sum, Skyscraper, and Numbered Room clue semantics
- Row/Column Indexer semantics
- malformed outside rays and malformed global digit groups
- custom definition shape
- fog light/trigger shape

The deeper SudokuMaker worker API (`getCellsSeenByCells`, `getComponents`, `validateConstraints`, `validateGrid`) and full solver-backed diagnostics remain Phase 11H by design.
