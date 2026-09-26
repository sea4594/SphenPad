SphenPad current-state checkpoint
Created: 2026-09-25
State: Phase 11L complete release candidate; required Phases 1-10 remain complete and compatibility gates remain intact.

Final Phase 10D release gate: PASSED
Release content SHA-256: 12b5f529f9917c9182ce3519045d51c22ec763154855817e53e973c11e6ee715

Phase 11A completed:
- Definitive SudokuMaker parity inventory from supplied deployed main bundle + worker.
- 47 first-class SudokuMaker constraint/tool types inventoried and assigned to Phase 11 slices.
- CreatorProject v1 authoring model and loss-preserving PuzzleDefinition bridge.
- Authored JSON v4 with v3 migration retained.

Phase 11B completed:
- CreatorProject is a first-class persisted IndexedDB record with automatic legacy creator migration.
- New/Open/Duplicate/Rename/Delete, recents, dirty state, 700 ms autosave, manual Save, and unload protection.
- Creator projects participate in local/account sync with deletion tombstones and conflict handling.
- Existing PuzzleDefinition/renderer/player path remains through a derived compatibility row.

Phase 11C completed:
- Editable grid rows/columns and explicit digit range/count.
- Persisted regular, irregular, and no-region modes with configurable regular box dimensions.
- Givens and solution authoring by board entry or pasted grid.
- Lossless per-cell multi-digit solution storage with compact legacy solution compatibility when possible.
- Board-based irregular region assignment, regular region generation, and region clearing.
- Resize behavior preserves in-bounds authored data and removes constraints/visuals touching cropped cells.
- Clear actions for givens, solution, both, and regions.
- Expanded structural validation for grid/digits/regions/solutions/givens.

Phase 11C reports:
- reports/PHASE11C_GRID_STRUCTURE.md
- reports/PHASE11C_TESTS.txt

Phase 11D completed:
- Generic stable authored-object selection for semantic constraints and non-semantic cosmetics.
- Shared property/appearance inspector with rename, enable/disable, per-object ignore-in-solver, duplicate, delete, and ordering actions.
- Cosmetic graphic underlay/overlay controls and stable multi-part grouping.
- Cosmetic lines/cages/symbols now persist in CreatorProject.cosmetics rather than as fake semantic constraints.
- Added cosmetic text, shapes, multiple image graphics, and metadata-backed background-image editing.
- Creator image graphics render through the existing SudokuPad/SphenPad asset resolver path.

Phase 11D reports:
- reports/PHASE11D_OBJECTS_COSMETICS.md
- reports/PHASE11D_TESTS.txt

Phase 11E completed:
- Native semantic authoring for thermometer/slow thermometer, whisper (German/Dutch/custom), renban, palindrome, between, region-sum, sequence, grouped entropy/modular/parity, lockout, arrow, and double-arrow line families.
- Ordered-selection path creation plus whole-path replacement and reversal while preserving stable object identity and common appearance settings.
- Rule-specific property editing for slow thermometers, whisper minimum differences, repeated-region sums, grouped digit sets, and arrow bulb-cell counts.
- Creator validation for the implemented line semantics plus malformed-path/group diagnostics.
- Compatibility normalization for generic Phase 10D/11D line records into the 11E semantic model.

Phase 11E reports:
- reports/PHASE11E_LINE_PATH_CONSTRAINTS.md
- reports/PHASE11E_TESTS.txt

Phase 11F completed:
- Native semantic authoring for Even, Odd, Minimum, Maximum, Difference, Ratio, XV, Killer Cages, Clone groups, Quadruples, Look-and-Say Cages, Different Values/Extra Regions, and Counting Circles.
- Upstream-compatible custom Difference/Ratio values, negative Difference/Ratio/XV rules, and Difference/Ratio cross-family override behavior.
- Shared 11D inspector integration for cells, clues, multisets, negative-rule settings, and rule-specific properties while retaining stable object IDs and appearance controls.
- Creator semantic/structural validation plus legacy generic-record normalization and CreatorProject round-trip support.

Phase 11F reports:
- reports/PHASE11F_GROUP_EDGE_CAGE_CONSTRAINTS.md
- reports/PHASE11F_TESTS.txt

Phase 11G completed:
- Explicit Standard row/column SudokuRules toggle persisted through CreatorProject and respected by creator/player conflict checking.
- Native semantic authoring for both diagonals, Disjoint Groups, Nonconsecutive, Global Entropy, and the SphenPad Global Modulo-3 preset; Anti-King/Anti-Knight remain native global flags.
- Native outside clue authoring for Little Killers, Sandwich Sums, X-Sums, Skyscrapers, and Numbered Rooms with ordered edge rays and clue visuals.
- Native Row/Column Indexers using the supplied SudokuMaker worker semantics.
- Custom constraint definition/input/components/backend-code persistence and editor fields without executing arbitrary author code in creator mode.
- First-class Fog Lights and Fog Triggers with independent trigger/effect cells synchronized into the existing scene fog representation.
- Creator validation, legacy normalization, and focused regression coverage for the complete 11G family.

Phase 11G reports:
- reports/PHASE11G_GLOBAL_OUTSIDE_ADVANCED.md
- reports/PHASE11G_TESTS.txt

Phase 11H completed:
- Added creator worker-equivalent APIs for getCellsSeenByCells, getComponents, validateConstraints, and validateGrid.
- Cells-seen queries return the intersection seen by every selected cell and propagate Clone/Palindrome equality equivalences.
- Component inspection exposes row/column/region houses and active semantic constraint components.
- Constraint validation reports configuration errors by stable constraint ID.
- Grid validation returns exact invalid cells, structured diagnostics, and safely reported unsupported custom-code execution.
- Added creator logical solving using naked/hidden singles plus an MRV solution finder with persisted max-solutions, max-nodes, and logical-step settings.
- Added editor actions for live worker validation, cells-seen selection, component inspection, logical solve, solution search, and explicit adoption of a found solution.
- Worker-invalid cells are highlighted on the creator board without mutating authored puzzle data.

Phase 11H reports:
- reports/PHASE11H_WORKER_VALIDATION_SOLVER.md
- reports/PHASE11H_TESTS.txt

Phase 11I completed:
- Exact CreatorProject/SphenPad JSON editable interchange plus native SudokuPad JSON/SCL/link export.
- SudokuPad/SCL and F-Puzzles imports reuse the established Phase 1-10 parsers and reconstruct safely inferable semantics.
- Structured preservation/warning/loss reporting and focused round-trip tests.

Phase 11I reports:
- reports/PHASE11I_IMPORT_EXPORT.md
- reports/PHASE11I_TESTS.txt

Phase 11J completed:
- Creator Playtest now runs through the actual PuzzlePage with normal SphenPad controls in an isolated fresh session.
- Returning to Creator restores editor selection/tool/inspector context.
- Saved creator projects appear in Home/My Puzzles with Creator ownership markers and direct Edit in Creator actions.
- Normal My Puzzles solve progress is rebased across creator saves rather than reset; playtest progress is never persisted.
- Creator-owned deletion from Home/folders uses creator tombstones so account sync cannot resurrect stale projects.

Phase 11J reports:
- reports/PHASE11J_PLAYTEST_MY_PUZZLES.md
- reports/PHASE11J_TESTS.txt

Phase 11K completed:
- multiselect/bulk editing, creator-object clipboard, keyboard/context actions, path-point editing, alignment/snapping, absolute layers, zoom/pan, and persistent per-tool defaults.

Phase 11K reports:
- reports/PHASE11K_EDITING_UX.md
- reports/PHASE11K_TESTS.txt

Phase 11L completed:
- Final executable audit covers all 47 SudokuMaker first-class upstream tool types and 50 SphenPad mappings/variants.
- Final UI/workflow audit verifies every inventory row is exposed plus project/account/validation/interchange/playtest/My Puzzles/editing wiring.
- Complete 11A-11K creator regression matrix passes from a dependency-free TypeScript compile/run path.
- Phase 1-10 proxy/asset/font/pinned-manifest compatibility checks pass.
- Added aggregate Phase 11 tests, a dependency-backed final release gate, and Phase 11 release hashes.
- Intentional security limitation: Custom backend JavaScript is preserved but not executed locally; validation/export report this explicitly.
- Dependency-backed Vite/ESLint/browser gate must run in the normal networked/GitHub environment before live deployment because npm ci cannot complete in this execution environment.

Phase 11L reports:
- reports/PHASE11L_FINAL_PARITY_AUDIT.md
- reports/PHASE11L_RELEASE_GATE.md
- reports/PHASE11L_TESTS.txt

Next step: run `npm run finish-phase11-release` in CI/networked checkout and deploy the existing GitHub Pages workflow from `main`.
