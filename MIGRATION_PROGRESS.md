# SudokuPad Importer/Renderer Replacement Progress

Target: stock SudokuPad 0.612.0 captured from the supplied HARs.
Primary goal: any puzzle the captured stock SudokuPad build can import/render should import/render through SphenPad's single native SVG path.

## Completed

- [x] Phase 1 — native source/scene/logic/settings model and persistence scaffolding
- [x] Phase 2 — native 64-unit SVG renderer, layers, primitives, cells, cages and viewBox
- [x] Phase 3 — exact SCL/CTC/PuzzleZipper path, native normalization and feature recognition
- [x] Phase 4 — F-Puzzles, SCF, packs, unified resolver, URL settings and remote/legacy input handling
- [x] Phase 5 — fog, external/background assets, Twemoji and all captured optional puzzle-font definitions
- [x] Phase 6 — production imported-puzzle cutover to the new loader + SVG renderer and interaction overlay
- [x] Phase 7 — creator/editor/checker migration to native scene + separate PuzzleLogic; legacy Canvas/PuzzleCosmetics removed
- [x] Phase 8 — complete stock feature-module parity audit, finite SVG settings/core cases implemented, archive import audit
- [x] Phase 9 — browser conformance oracle against the captured stock app in the same Chromium (**9A–9E complete; 519 successful real-puzzle comparisons**)

## Current validation status

### Source/import parity

- 37 / 37 captured `feature-*.js` modules audited.
- `feature-userplugins.js` is the explicit arbitrary-JS/CSS boundary.
- 4,051 / 4,051 cached archive puzzles import; 0 failures.
- F-Puzzles converter parity previously matched all 288 archived F-Puzzles payloads.
- Native SCL/CTC path previously parsed all 2,138 native payloads and feature recognition matched the captured stock classifier.

### Browser renderer parity — Phase 9 (complete)

The offline oracle in `scripts/run-sudokupad-browser-conformance.py` reconstructs stock SudokuPad directly from the captured HAR and executes stock + SphenPad in the same system Chromium. Both serialized SVGs are rerendered in clean pages for raster comparison so SudokuPad dialogs, app scaling, and transient animation state cannot contaminate the result.

A 2026-09-23 recovery audit found that the retained Phase-9 evidence did **not** satisfy this repo's own conformance checklist: the checklist calls for 100+ branch-complete synthetic fixtures, combinational fixtures, and 500+ real browser-render comparisons. The retained suite had 11 synthetic fixtures and a five-puzzle archive sample. See `reports/SUDOKUPAD_PHASE9_RECOVERY_AUDIT.md`.

The original synthetic gate remains useful and, after fixing an asynchronous stock-feature race in the oracle, freshly reruns at **11 / 11 passed**.

- Captured real HAR puzzle: structural equality + 0 differing pixels.
- Primitive/outside-grid fixture: structural equality, 0.0382% materially different pixels.
- Recognized features: structural equality, 0.0072%.
- Row/column labels + compact marks: structural equality, 0%.
- Dark/grid/outline settings: structural equality, 0%.
- Arrows-above-lines: structural equality, 0%.
- Barbie route: structural equality, 0%.
- Fog final state: structural equality, 0%.
- Twemoji: raster-validated at 0.1591%; serialized Twemoji bounds are viewport/board-scale dependent in stock, so those coordinates are not treated as canonical structure.
- Metadata external background: structural equality + 0%.
- Sudorkle final state: structural equality + 0%.

Bounded real archive browser sample: **5 / 5 passed** structurally and by raster. The five unique deterministic samples include beginning, middle/end, and additional early-distribution entries; observed pixel ratios were 0% except one at 0.0043%.

A larger 12-entry run was attempted, but an exceptionally large embedded SCL fixture causes a single stock-app boot to exceed the sandbox command time limit. The full browser sweep is therefore a Phase-10 sharded job rather than one monolithic command.


### Phase 9B — branch-complete synthetic renderer gate (complete)

- Durable synthetic browser suite expanded to **101 fixtures**.
- Newly covered line/arrow/rectangle/text/cage/mark/settings/dimension/feature-recognition branches pass against captured stock SudokuPad.
- Deliberate non-9x9/rectangular coverage includes 3x5, 6x4, 10x10 and 21x22.
- Phase 9B found/fixed stock-parity differences including `roundedRadius` serialization, large-digits 9-candidate sizing, authored/generated cage order, `zeroisten` rule sourcing and generated Windoku cages.

### Phase 9C — production progress/player integration (complete)

- **18 / 18** production-progress fixtures pass.
- **11 / 11** stock-comparable progress cases have structural equality and **0 differing pixels**.
- **7 / 7** SphenPad-specific policy/control assertions pass (conflict setting, highlights, line colors, double lines, edge lines, line marks).
- Dynamic ordinary/deep/triggered fog and fog + outside clue are covered.
- Completion-triggered Sudorkle is covered through real `progress.status`.
- `sceneWithPuzzleProgress()` was fixed so deep-fog hidden givens retain player-entered values, while normal given visual precedence remains stock-equivalent.
- The board's settings-class projection is now a shared production helper used by both `SudokuPadBoard` and the browser oracle; settings regressions remain exact.
- See `reports/SUDOKUPAD_PHASE9C_PROGRESS_INTEGRATION.md`.

### Phase 9D — F-Puzzles browser conversion matrix (complete)

- **41 / 41** recognized F-Puzzles converter keys now have browser coverage against captured stock SudokuPad.
- **57 / 57** total key/subbranch/special fixtures pass.
- Coverage includes grid values/marks/colors/regions, arrows and bulb variants, killer/generic/indexer cages, little killers, ratio/difference/XV, thermos, palindromes, sandwich/odd/even, extra regions, clones, quadruples, between/min/max/generic lines, cosmetics, globals, fog/triggered fog, and unknown-key diagnostics.
- Converted-input hard-coded `MONOPOLYSUDOKU` and experimental `TmMBJj8jbr` behavior match structurally and with 0 differing pixels.
- Explicit `puzzlefont` and legacy `digitfont=12` → `sevensegment` setting plumbing is browser-verified; exact binary glyph testing remains Phase 10 because the 13 optional font files were absent from the HAR.
- Phase 9D found/fixed stock serialization of nonstandard `textColor` attributes on generic cosmetics.
- Phase 4's existing **288 / 288** archived F-Puzzles converter parity remains the converter-output oracle; Phase 9D adds browser-render conformance on top of it.
- See `reports/SUDOKUPAD_PHASE9D_FPUZZLES_BROWSER_MATRIX.md`.


### Phase 9E — real archive browser corpus (complete)

- Deterministic first pass collected **540 real archive puzzles** with renderer/importer code frozen.
- **508** passed immediately, **11** produced genuine render mismatches, and **21** hit the bounded browser timeout.
- The 11 mismatches were clustered before any fixes and reduced to recurring causes rather than puzzle-specific patches.
- Grouped fixes covered native cage `borderColor`/`textColor`, authored lower-case symbols, `cell-grids` insertion order, late post-font viewBox measurement, and stock Twemoji feature/oracle behavior.
- **11 / 11** original mismatch cases pass after grouped fixes.
- A deterministic **100-puzzle post-fix spread regression** is accepted as **100 / 100** after hardening one observed structurally-identical Chromium raster flake with a single same-SVG reraster retry.
- Phase-9 acceptance corpus contains **519 unique successful stock-vs-SphenPad browser comparisons**, exceeding the 500+ gate.
- The **21 timeout cases are not counted as passes** and remain mandatory inputs to Phase 10's dedicated long-running shards during the full 4,051-puzzle sweep.
- See `reports/SUDOKUPAD_PHASE9E_REAL_CORPUS.md`.

### Bugs/behavioral differences found and fixed by Phase 9

1. `SvgRenderer.getContentBounds()` was detaching `getBBox` from its SVG element; the receiver is now preserved.
2. Metadata background images now trigger stock-equivalent post-insertion content-bound/viewBox recomputation.
3. Fog final fade-group opacity state matches stock.
4. Fog-hidden givens remain rendered in the masked givens layer while entered values can coexist in the unmasked values layer, matching stock fog/deep-fog precedence.
5. Twemoji replacement uses browser-relative bounds and preserves stock `alt` text.
6. The conformance harness standardizes dark backing and final Sudorkle state so app UI/animation timing does not create false failures.
7. `roundedRadius` serialization, large-digits 9-candidate sizing, authored/generated cage order, `zeroisten` rule sourcing and generated Windoku cages now match stock.
8. Generic cosmetic `textColor` is preserved as a stock SVG passthrough attribute.
9. Deep-fog player values are retained through the production progress adapter so hidden givens reveal like stock.

Reports:

- `reports/SUDOKUPAD_STOCK_FEATURE_PARITY.md`
- `reports/sudokupad-archive-audit.json`
- `reports/SUDOKUPAD_BROWSER_CONFORMANCE.md`
- `reports/sudokupad-browser-conformance.json`
- `reports/SUDOKUPAD_BROWSER_CONFORMANCE_ARCHIVE_SAMPLE.md`
- `reports/sudokupad-browser-conformance-archive-sample.json`
- `reports/SUDOKUPAD_PHASE9_SUMMARY.md`
- `reports/SUDOKUPAD_PHASE9C_PROGRESS_INTEGRATION.md`
- `reports/SUDOKUPAD_PHASE9D_FPUZZLES_BROWSER_MATRIX.md`
- `reports/SUDOKUPAD_PHASE9E_REAL_CORPUS.md`

## Remaining required work

### Phase 10 — production hardening and release parity

#### Phase 10A — production environment + asset fidelity — COMPLETE

- [x] Harden controlled puzzle/asset proxy and add deterministic proxy tests.
- [x] Add client asset-resolver tests and production proxy fallback coverage.
- [x] Verify and SHA-256 pin all 13 exact optional SudokuPad font binaries from the upstream 0.612.0 asset paths.
- [x] Verify all nine real archive metadata-background URLs, with previously verified baselines used only for transient live network failures.
- [x] Complete clean `npm ci`, actual `npm build`, built-output integrity verification, and built React/Vite Chrome smoke test.
- [x] Clear the production lint gate after the networked closure run exposed pre-existing lint issues.

#### Phase 10B — 1,000-puzzle production conformance sample — COMPLETE FOR REQUESTED SCOPE

The originally planned 4,051-puzzle sweep was intentionally reduced by user request to a reproducible 1,000-puzzle sample.

- [x] Freeze a corpus before testing: all 21 Phase-9E heavy cases plus 979 uniformly sampled remaining archive puzzles, fixed seed `106120`.
- [x] Attempt all 1,000 cases before changing renderer/importer code.
- [x] First pass: 932 passes, 68 timeouts, 0 completed structural/raster mismatches.
- [x] Larger-budget reruns resolved 47 of the 68 timeout cases as passes before any product fix.
- [x] Cluster the 3 actual compatibility mismatches into one root cause: late `metadata.bgimage` SVG images incorrectly expanded final content bounds by an extra 16-unit snap/padding step.
- [x] Fix that root cause as a group and canonicalize the known stock-vs-SphenPad metadata-background serialization difference while keeping raster comparison authoritative.
- [x] Revalidate all 3 mismatch cases: 3/3 exact structural passes, with 0%/0%/~0% raster delta.
- [x] Run a compact post-fix regression gate: `captured-real`, `labels-compact-marks`, and `dark-grid-settings` all exact with 0 differing pixels.
- [ ] 18 pathological cases remain performance-unresolved and are not counted as passes: 13 exceed the bounded window in stock rendering; 5 hit the cumulative candidate-stage budget, of which 2 pass candidate-only and 3 complete candidate rendering but exceed the diagnostic PNG-raster budget. Carry these into the final release gate rather than treating them as compatibility passes.

Final requested-scope result: **1,000/1,000 attempted; 982 definitive stock-vs-SphenPad browser comparisons pass; 0 known compatibility failures remain among completed comparisons; 18 performance-unresolved**.

Detailed report: `reports/SUDOKUPAD_PHASE10B_1000_SAMPLE.md`.

#### Phase 10C — compatibility lock + settings polish — COMPLETE

- [x] Pin the targeted SudokuPad 0.612.0 resources: 67 captured JS/CSS hashes, 13 exact font hashes, and authoritative normal/fog HAR hashes.
- [x] Add `npm run verify-sudokupad-upstream-target`; upstream drift is reported and never silently changes the compatibility target.
- [x] Lock compatibility wording: authored/static/final states are the exact parity target; transient animation timing/intermediate frames are not claimed exact.
- [x] Expose synced **Compact Marks** and **Row/Column Labels** settings, off by default, while preserving explicit SudokuPad URL-setting precedence and existing SphenPad controls.
- [x] Recheck `captured-real` and `labels-compact-marks`: 2/2 exact structural passes with 0 differing pixels.

Detailed report: `reports/SUDOKUPAD_PHASE10C_COMPATIBILITY_LOCK.md`.

#### Phase 10D — release cleanup + final gate — FINAL NETWORKED GATE PENDING

- [x] Disposition all 18 Phase-10B performance cases: all 18 complete SphenPad browser rendering; 13 were stock-reference performance cases, 2 also pass isolated raster, and 3 are slow only in PNG rasterization. None is a known app-render failure.
- [x] Remove release-time debug logging and move font verification metadata/readme out of `public/` so it is not copied into the production bundle.
- [x] Add a production-bundle cleanliness verifier and final release hash manifest generator.
- [x] Run final captured-oracle representative conformance: 8/8 pass, including ordinary, fog, F-Puzzles, background, custom font, compact marks/labels, and SphenPad-specific controls.
- [x] Revalidate the captured compatibility target: 67/67 pinned JS/CSS assets match the supplied 0.612.0 HAR.
- [ ] Final networked release gate: clean `npm ci`, production dependency audit, lint, Vite build, built-artifact check, bundle-clean check, built-app Chrome smoke, proxy/asset unit tests, and release hashes. Use `npm run finish-phase10d-release`.

### Optional Phase 11 — creator/editor product expansion

The beta creator/editor already uses native `SudokuPadScene` + `PuzzleLogic`; no legacy creator compatibility is required. Optional work can freely improve generic primitive editing, line/arrow/cage creation, constraint templates, property inspection, import-to-editor, SCL export, validation, and undo/redo UX. This is product work, not required for SudokuPad import/render parity.

## Intentional boundary

Arbitrary SudokuPad user plugins execute arbitrary JavaScript/CSS and are not part of the finite stock puzzle-payload compatibility guarantee.

### Phase 11A — creator architecture + SudokuMaker parity inventory — COMPLETE

- [x] Derived a definitive 47-type first-class SudokuMaker constraint/tool inventory from the supplied deployed main bundle and worker rather than the existing SphenPad catalog.
- [x] Recorded configurable variants (including slow thermometers and configurable Dutch/German whispers) separately from first-class upstream types.
- [x] Added the two missing Phase-10D catalog entries: Different Values and Counting Circles (implementation remains 11F).
- [x] Fixed the Phase-11H worker behavior target to `getCellsSeenByCells`, `getComponents`, `validateConstraints`, and `validateGrid`.
- [x] Added versioned `CreatorProject` v1 with grid spec, metadata, givens/solution, regions, constraints, cosmetics, creator settings, semantic flags, and forward-compatible round-trip data.
- [x] Added loss-preserving `CreatorProject` <-> existing `PuzzleDefinition`/`SudokuPadScene`/`PuzzleLogic` conversion; no new renderer/player path was introduced.
- [x] Advanced downloadable authored JSON from v3 to v4 while retaining v3 migration/import support.
- [x] Added creator-specific round-trip, migration, malformed-version, inventory-count, and worker-API tests.

Report: `reports/PHASE11A_CREATOR_ARCHITECTURE_PARITY.md`.

### Phase 11B — creator project management + persistence — COMPLETE

- [x] Persist CreatorProject as its own IndexedDB entity while retaining a derived PuzzleDefinition compatibility row for the existing player path.
- [x] Lazily migrate existing creator puzzle rows into first-class CreatorProject records.
- [x] Add New/Open/Duplicate/Rename/Delete lifecycle actions and recent-project tracking.
- [x] Add dirty state, 700 ms autosave, manual Save, unload protection, and pre-navigation flushes.
- [x] Include creator projects in account snapshots/merge behavior with synced deletion tombstones and edit/open conflict handling.

Report: `reports/PHASE11B_PROJECT_STORAGE.md`.

### Phase 11C — grid definition, givens, solution, digits, regions — COMPLETE

- [x] Add editable grid width/height (1-30) and explicit digit minimum/maximum/count (1-64).
- [x] Add persisted region layout metadata for regular boxes, irregular regions, or no regions, including regular box dimensions.
- [x] Add board and text-grid authoring for givens and solutions; ordinary compact grids and whitespace/comma-separated multi-digit grids are supported.
- [x] Preserve multi-digit solutions losslessly as per-cell solution entries while retaining the legacy compact solution string when representable.
- [x] Add board-based irregular-region assignment plus regular-region generation and clear-region behavior.
- [x] Add resize semantics that retain in-bounds givens/solutions/regions and discard constraints/constraint visuals that reference cropped cells.
- [x] Add clear-givens, clear-solution, clear-both, and clear-regions actions.
- [x] Extend creator structure validation for dimensions, digit ranges, row/column/region duplicates, region overlap/coverage/size/box geometry, solution bounds/completeness/duplicates, and given-vs-solution conflicts.
- [x] Add focused 11C regression tests, including 6x6 regular boxes, 10-13 multi-digit solutions, irregular-region errors, resize cropping, visual cleanup, and clears.

Reports:
- `reports/PHASE11C_GRID_STRUCTURE.md`
- `reports/PHASE11C_TESTS.txt`

### Phase 11D — generic object editing + cosmetics — COMPLETE

- [x] Add stable generic authored-object identity/selection for constraints and cosmetics.
- [x] Add a shared property/appearance inspector with rename, enable/disable, per-object ignore-in-solver, duplicate, delete, and visual ordering.
- [x] Add cosmetic underlay/overlay layer controls.
- [x] Store new cosmetic lines/cages/symbols in CreatorProject.cosmetics instead of semantic PuzzleLogic constraints while preserving legacy creator content.
- [x] Add cosmetic text, shape, image, and background-image authoring/editing.
- [x] Render positioned cosmetic image objects through the existing image asset resolver.
- [x] Add focused 11D regression tests covering object identity, properties, enable/ignore, cosmetics round-trip, duplication, ordering, layers, backgrounds, and legacy visuals.

Reports:
- `reports/PHASE11D_OBJECTS_COSMETICS.md`
- `reports/PHASE11D_TESTS.txt`

### Phase 11E — line/path constraint authoring — COMPLETE

- [x] Add native semantic authoring for Thermometer, Slow Thermometer, Whisper, Renban, Palindrome, Between Line, Region Sum Line, Sequence Line, Entropy/Grouped Line, Lockout Line, Arrow, and Double Arrow.
- [x] Add German/Dutch/custom Whisper differences derived from the configured digit count.
- [x] Add Entropic, 3-Modular, and Parity grouped-line presets with editable disjoint digit groups.
- [x] Add repeated-region Region Sum Line behavior and multi-cell Arrow bulbs.
- [x] Create paths from ordered selection, replace paths from selection, and reverse paths while retaining stable object identity and appearance.
- [x] Add creator-side semantic and structural line validation.
- [x] Normalize pre-11E generic line objects into the new semantic model without breaking older creator projects.
- [x] Add focused 11E regression tests and retain 11A-11D creator regression coverage.

Reports:
- `reports/PHASE11E_LINE_PATH_CONSTRAINTS.md`
- `reports/PHASE11E_TESTS.txt`

### Phase 11F — cell/group/edge/corner/cage constraint authoring — COMPLETE

- [x] Add native semantic authoring for Even, Odd, Minimum, Maximum, Difference, Ratio, XV, Killer Cages, Clone groups, Quadruples, Look-and-Say Cages, Different Values/Extra Regions, and Counting Circles.
- [x] Match the supplied SudokuMaker worker semantics for fortress cells, configurable Difference/Ratio clues, negative Difference/Ratio/XV rules, Killer uniqueness/sums, Clone equality groups, Quadruple multisets, Look-and-Say pairs, Different Values, and Counting Circles.
- [x] Add family-specific property controls to the generic Phase 11D authored-object inspector.
- [x] Add creator semantic/structural validation and compatibility normalization for older generic creator records.
- [x] Add focused 11F regression tests while retaining 11A-11E coverage.

Reports:
- `reports/PHASE11F_GROUP_EDGE_CAGE_CONSTRAINTS.md`
- `reports/PHASE11F_TESTS.txt`

### Phase 11G — global / outside / indexer / custom / fog tools — COMPLETE

- [x] Expose the standard row/column `SudokuRules` setting explicitly and persist it through CreatorProject.
- [x] Add native semantic authoring for Positive/Negative Diagonal, Disjoint Groups, Nonconsecutive, Global Entropy, and the existing Global Modulo-3 preset; retain Anti-King/Anti-Knight as native global flags.
- [x] Add Little Killer, Sandwich Sum, X-Sum, Skyscraper, and Numbered Room outside-clue objects with ordered edge rays and native visuals.
- [x] Add Row Indexer and Column Indexer objects matching the supplied SudokuMaker worker semantics.
- [x] Add SudokuMaker-style Custom constraint definition/input/components/code persistence and editor fields without executing arbitrary code in creator mode.
- [x] Replace ad-hoc creator fog mutations with first-class Fog Light and Fog Trigger constraints, including independent trigger/reveal sets and derived scene-fog synchronization.
- [x] Add creator semantic/structural validation and compatibility normalization for the complete 11G family.
- [x] Add focused 11G regression tests while retaining 11A-11F coverage.

Reports:
- `reports/PHASE11G_GLOBAL_OUTSIDE_ADVANCED.md`
- `reports/PHASE11G_TESTS.txt`

### Phase 11H — worker validation / diagnostics + solver support — COMPLETE

- [x] Add creator worker-equivalent `getCellsSeenByCells`, `getComponents`, `validateConstraints`, and `validateGrid` APIs based on the supplied SudokuMaker worker behavior.
- [x] Return the intersection of cells seen by all selected cells, including Clone/Palindrome equality-equivalence propagation.
- [x] Expose row/column/region houses and active semantic constraint components for creator inspection.
- [x] Return configuration errors by stable constraint ID and exact invalid cells plus structured diagnostics for grid validation.
- [x] Cover the implemented Phase 11E-11G semantic families in partial-assignment-aware worker validation; custom executable JavaScript is reported as unsupported rather than executed in creator mode.
- [x] Add logical solving with naked/hidden singles and MRV solution search with persisted max-solutions, max-nodes, and logical-step settings plus multiple-solution detection.
- [x] Add creator UI actions for validation, invalid-cell highlighting, cells-seen selection, component inspection, logical solving, solution finding, and explicit use of a found solution.
- [x] Add focused 11H worker/solver regression tests while retaining 11A-11G coverage.

Reports:
- `reports/PHASE11H_WORKER_VALIDATION_SOLVER.md`
- `reports/PHASE11H_TESTS.txt`

### Remaining Phase 11 work after 11H

- Phase 11I: editable import/export and SudokuPad/SCL/F-Puzzles-compatible link/file round trips, including loss reporting and round-trip tests.
- Phase 11J: real SphenPad playtest lifecycle and Home/My Puzzles integration.
- Phase 11K: editing UX parity (robust undo/redo, richer multiselect/bulk edit, clipboard, shortcuts/context actions, fine drag/snapping/layers/zoom/pan/defaults).
- Phase 11L: final 47-type/non-constraint parity audit, browser/persistence/account/import-export/playtest regression, cleanup, and release gate.

### Phase 11I — creator import / export parity — COMPLETE

- [x] Add exact editable import/export for CreatorProject JSON and SphenPad authored JSON.
- [x] Reuse the established Phase 1–10 SudokuPad/SCL and F-Puzzles decoders rather than adding a parallel parser.
- [x] Add native SudokuPad source JSON export, compressed SCL file/payload export, and direct `https://sudokupad.app/scl...` link generation.
- [x] Strip creator-only SphenPad tags from external SudokuPad exports while retaining the native render scene and supported metadata/global/fog data.
- [x] Import raw SudokuPad source JSON, SCL/CTC payloads, SudokuPad links, raw F-Puzzles JSON, and fpuz/fpuzzles payloads into editable CreatorProject state.
- [x] Reconstruct safely inferable SudokuPad semantics and recognized F-Puzzles semantic constraint families while retaining converted visuals.
- [x] Add structured preserved/warning/loss reporting for unsupported or nonportable data instead of silently dropping it.
- [x] Add file and clipboard interchange actions to the creator File tab.
- [x] Add focused 11I round-trip/interchange tests while retaining 11A-11H coverage.

Reports:
- `reports/PHASE11I_IMPORT_EXPORT.md`
- `reports/PHASE11I_TESTS.txt`

### Remaining Phase 11 work after 11I

- Phase 11J: real SphenPad playtest lifecycle and Home/My Puzzles integration.
- Phase 11K: editing UX parity (robust undo/redo, richer multiselect/bulk edit, clipboard, shortcuts/context actions, fine drag/snapping/layers/zoom/pan/defaults).
- Phase 11L: final 47-type/non-constraint parity audit, browser/persistence/account/import-export/playtest regression, cleanup, dependency-backed build/lint/release gate, and final Phase 11 checkpoint.

### Phase 11J — real SphenPad playtest + Home/My Puzzles — COMPLETE

- [x] Route creator Playtest through the actual `/p/:puzzleId` PuzzlePage and normal SphenPad controls rather than a creator-local simulation.
- [x] Start every creator playtest from a fresh isolated solve state and suppress storage writes so test progress cannot mutate authored state or ordinary My Puzzles progress.
- [x] Return directly to the same creator project and restore selection, active tab/element/object, authoring state, and input-tool context.
- [x] Stop hiding creator compatibility rows from Home/My Puzzles; mark them as creator-owned/editable and provide direct Edit in Creator actions from Home, folder views, and the puzzle page.
- [x] Rebase normal solver progress across creator saves so title/rules/cosmetic edits do not wipe progress, while gameplay-definition changes safely invalidate stale history and givens.
- [x] Use creator tombstone deletion from Home/folders so creator project, compatibility puzzle, folder membership, and account sync stay coherent.
- [x] Use the Phase 11I SCL exporter for creator-owned Copy SudokuPad Link actions.
- [x] Add focused 11J model tests and source-level lifecycle integration checks while retaining 11A-11I coverage.

Reports:
- `reports/PHASE11J_PLAYTEST_MY_PUZZLES.md`
- `reports/PHASE11J_TESTS.txt`

### Remaining Phase 11 work after 11J

- Phase 11K: editing UX parity (robust undo/redo, richer multiselect/bulk edit, clipboard, shortcuts/context actions, fine path/point dragging, snapping/alignment, improved layers, zoom/pan/navigation, and persistent tool defaults).
- Phase 11L: final 47-type/non-constraint parity audit, end-to-end browser/persistence/account/import-export/playtest/editor regression, Phase 1-10 compatibility verification, cleanup, dependency-backed build/lint/release gate, and final Phase 11 checkpoint.


### Phase 11K — creator editing UX parity — COMPLETE

- [x] Add keyboard-accessible undo/redo on the existing creator definition history and keep bulk/path/clipboard operations atomic history steps.
- [x] Add richer multi-object selection plus bulk enable/disable, duplicate/delete, style edits, alignment/snapping, and absolute layer ordering.
- [x] Add versioned authored-object copy/paste using the system clipboard with an in-app fallback and fresh object IDs for cross-project paste.
- [x] Add right-click object context actions and touch-friendly `...` actions.
- [x] Add individual line/path point replace, nudge, insert, delete, and drag reorder while preserving semantic object identity/style.
- [x] Add cosmetic alignment and snap-to-cell/snap-to-grid helpers.
- [x] Add board zoom/pan/navigation controls and keyboard/wheel zoom.
- [x] Add persistent per-tool appearance/clue defaults that round-trip through CreatorProject metadata and apply to new objects.
- [x] Add focused 11K model and source-level editor integration tests while retaining the complete 11A-11J regression matrix.

Reports:
- `reports/PHASE11K_EDITING_UX.md`
- `reports/PHASE11K_TESTS.txt`

### Phase 11L — final parity audit / production hardening — COMPLETE RELEASE CANDIDATE

- [x] Add an executable 47-type SudokuMaker parity audit; all 47 upstream rows and 50 SphenPad mappings/variants are exercised through native authoring, CreatorProject round-trip, worker validation, and SudokuPad/SCL projection.
- [x] Add a source-level UI/workflow audit proving every inventory row is exposed and the project/account/validation/interchange/playtest/My Puzzles/editing flows remain wired.
- [x] Rerun the complete 11A-11K regression matrix together, including legacy v3 authored migration, storage/tombstone merge behavior, import/export loss reporting, playtest isolation/rebasing, and 11K editing UX.
- [x] Rerun dependency-free Phase 1-10 compatibility gates for the proxy, asset resolver, font loader, and pinned SudokuPad manifest.
- [x] Add aggregate `npm run test-creator-phase11`, final release hashes, and `npm run finish-phase11-release` for the full clean-install/lint/build/browser production gate.
- [x] Audit creator source for temporary TODO/FIXME/debug scaffolding.
- [x] Document the intentional Custom-constraint security boundary: backend JavaScript is preserved/round-tripped and reported, but arbitrary author code is not executed locally.
- [ ] External deployment gate only: run `npm run finish-phase11-release` in the normal networked/GitHub environment; this execution environment cannot complete `npm ci`, so Vite/ESLint/built-browser checks are not falsely marked as passed here.

Reports:
- `reports/PHASE11L_FINAL_PARITY_AUDIT.md`
- `reports/PHASE11L_RELEASE_GATE.md`
- `reports/PHASE11L_TESTS.txt`

Phase 11 implementation is complete. The only necessary next step before a public live playtest is the dependency-backed CI release gate and deployment.
