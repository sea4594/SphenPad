# Phase 11I — Creator Import / Export Interchange

Phase 11I adds a first-class interchange layer for the creator without replacing the Phase 1–10 SudokuPad parser/normalizer. The existing SCL/CTC and F-Puzzles import pipeline remains the source of truth for decoding/render preservation; Phase 11I converts those results into editable CreatorProject state and reports any fidelity limits explicitly.

## Exact native round trips

- Raw `CreatorProject` JSON (`format: sphenpad-creator-project`) imports back into the current project identity with the complete authoring model.
- SphenPad authored JSON v4 (`format: sphenpad`) remains importable/editable through the existing migration layer.
- The editor can export either native format as JSON.

## SudokuPad / SCL

- Export native SudokuPad source JSON.
- Export compressed `scl...` payload files.
- Copy the SCL payload directly.
- Generate/copy a direct SudokuPad URL in the same fallback form used by SudokuMaker: `https://sudokupad.app/scl...`.
- Creator-only `data-sphenpad-*` tags and editor-only background metadata are stripped from the external SudokuPad payload.
- Grid, givens, regions, metadata, solution metadata, render primitives, fog, diagonals and supported globals are preserved.
- SCL/CTC payloads, raw SudokuPad source JSON, and SudokuPad links can be imported for editing.
- Native SudokuPad/SCL graphics are preserved as editable cosmetics. Semantics that can be inferred safely (regions, killer/extra-region cages, diagonals/global flags/fog) are reconstructed as semantic creator constraints. The import report calls out that other graphics may remain cosmetic because native SudokuPad data is primarily a playable/render representation rather than a SudokuMaker authoring graph.

## F-Puzzles

- Raw F-Puzzles JSON and `fpuz` / `fpuzzles` encoded payloads are accepted.
- The pinned Phase 1–10 F-Puzzles converter is reused for grid/render fidelity.
- Recognized semantics are reconstructed for anti-knight/anti-king, nonconsecutive, disjoint groups, thermometers, palindromes, between/lockout lines, arrows, even/odd/min/max, Difference/Ratio/XV, killer cages, extra regions, quadruples and clone groups.
- Unsupported converter keys are emitted as explicit `loss` entries instead of being silently dropped.
- Converted F-Puzzles graphics are retained as separately editable cosmetics while reconstructed semantics provide checking/solver behavior; the report explicitly warns that semantic property edits do not automatically restyle those independently imported graphics.

## Loss reporting

Every import/export returns a structured report with `preserved`, `warning`, and `loss` information. The editor displays it directly after the operation. Known SphenPad-only data such as custom executable backend code and `ignoreInSolver` metadata is never silently represented as portable SudokuPad logic.

## Clipboard / files

The creator File tab now supports CreatorProject JSON, SphenPad authored JSON, SudokuPad JSON, SCL files, copied SCL, copied direct SudokuPad links, file import, and clipboard import. Import retains the current creator project ID/source ID so it replaces the open project's content rather than accidentally creating an unrelated persistence record.
