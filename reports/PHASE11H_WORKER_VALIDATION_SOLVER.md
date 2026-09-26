# Phase 11H — Worker Validation, Diagnostics, and Solver Support

Phase 11H implements the creator-side equivalents of the four SudokuMaker worker/query targets identified from the supplied deployed worker bundle: `getCellsSeenByCells`, `getComponents`, `validateConstraints`, and `validateGrid`. It also adds the solver/solution-search support assigned to 11H by the Phase 11 parity inventory.

## Worker-equivalent creator API

Implementation: `src/sudokupad/creator/worker.ts`.

- `getCellsSeenByCells(definition, cells)` returns the intersection of cells seen by every selected cell. Standard row/column/region visibility follows the active SudokuRules/region configuration, while implemented semantic pair/exclusion constraints extend visibility. Clone and Palindrome equality links are propagated so equivalent cells inherit one another's seen cells, matching the important upstream behavior.
- `getComponents(definition)` exposes registered row, column, region, global, and semantic constraint components as structured records suitable for creator inspection.
- `validateConstraints(definition)` reports malformed/configuration-invalid constraints keyed by stable constraint ID rather than reducing them to an unstructured message list.
- `validateGrid(definition, grid?)` returns exact invalid cells, structured diagnostics, and thrown/unsupported execution errors. It is partial-assignment aware so the same semantic engine can support live creator diagnostics and search.

The detailed validator covers the creator semantic families implemented through 11G: base Sudoku houses, Anti-King/Anti-Knight, diagonals, disjoint/nonconsecutive/global grouped rules, line/path rules, edge/cell/group/cage rules, outside clues, and indexers. Arbitrary Custom Constraint JavaScript is persisted but never executed by creator validation; an explicit unsupported-execution diagnostic is returned instead.

## Solver support

Implementation: `src/sudokupad/creator/solver.ts`.

- Logical solve applies deterministic naked singles and hidden singles over active all-different houses/components.
- Solution search uses minimum-remaining-values backtracking and the partial-assignment worker validator for pruning.
- Solver settings expose maximum solution count, maximum search nodes, and logical-step limit; these settings persist through the CreatorProject bridge.
- Search distinguishes unique, multiple, unsolved/no-solution, invalid, limit-reached, and unsupported-custom-code outcomes.
- Stored authored solutions are not used as a search oracle and are not overwritten by solution search. A found solution is copied into the authored solution only through an explicit editor action.

## Creator UI integration

`PuzzleEditorPage` adds actions for:

- validating givens or the authored solution;
- highlighting exact invalid cells on the board;
- opening the first constraint with a configuration/grid diagnostic in the object inspector;
- selecting cells seen by the current board selection;
- inspecting registered components;
- running the logical solver;
- finding up to the configured number of solutions; and
- explicitly adopting a found solution.

Diagnostic highlighting is editor progress state only; it does not modify authored givens, solution data, constraints, or scene content.

## Compatibility boundary

No alternative player/renderer architecture was introduced. The Phase 1-10 `PuzzleDefinition` / `SudokuPadScene` / `PuzzleLogic` runtime remains the player path. Phase 11H operates on creator definitions and the existing semantic constraint representation.
