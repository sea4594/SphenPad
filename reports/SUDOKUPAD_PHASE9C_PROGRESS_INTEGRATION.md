# SudokuPad Phase 9C — Production Progress/Player Integration

Target: stock SudokuPad 0.612.0 captured in the supplied HAR.

## Result

**Phase 9C passes.**

- Production progress fixtures: **18 / 18 passed**.
- Stock-comparable progress fixtures: **11 / 11 structural matches** and **0 materially different pixels in every case**.
- SphenPad-specific player/control assertions: **7 / 7 passed**.
- Production board-class regression fixtures: **2 / 2 passed** with exact structure and 0 materially different pixels.

The browser harness now executes the same `sceneWithPuzzleProgress()` transformation used by `GridCanvas`, and uses the same DOM-free `sudokuPadBoardClassNames()` helper now consumed by `SudokuPadBoard`. Rendering, fog masks and assets then flow through the same native renderer modules as production.

## Stock-comparable player-state coverage

The following production-progress states match stock SudokuPad structurally and at 0 differing pixels:

- entered values;
- center marks;
- corner marks;
- value-over-mark precedence;
- authored-given precedence outside fog;
- ordinary fog reveal on a correct value;
- no fog reveal on an incorrect value;
- deep-fog hidden-given re-entry/reveal;
- triggered fog progression;
- dynamic fog with an outside-grid clue;
- completion-triggered final Sudorkle overlay.

## SphenPad controls intentionally preserved

Some SphenPad player controls have no one-to-one stock SudokuPad state to compare. They are therefore production-path assertions rather than stock raster comparisons. The native renderer preserves:

- conflict checker enabled: two duplicate values create two `.cell-error` overlays;
- conflict checker disabled: no `.cell-error` overlays;
- multi-highlight wedges and their existing colors;
- center-line drawing and selected line color;
- SphenPad double-line drawing with both selected colors;
- edge-line drawing;
- center/edge line marks (circle/X).

No SphenPad control behavior was changed to imitate a different SudokuPad UI policy. In particular, conflict visibility remains controlled by SphenPad's own conflict-checker setting.

## Production discrepancy found and fixed

### Deep-fog hidden givens

`sceneWithPuzzleProgress()` previously discarded a player-entered value whenever the authored source cell contained a given. That is wrong for stock deep fog: a hidden given can temporarily behave as a normal entry target, and re-entering the matching value is what reveals the cell.

The adapter now retains `progressCell.value` even on authored-given cells. Normal non-fog rendering is unchanged because the renderer still applies stock given-over-value visual precedence. The dedicated deep-fog fixture now matches stock exactly.

## Oracle hardening made during 9C

- Stock-equivalent post-load value/candidate/pencilmark actions can now be applied to the captured SudokuPad app.
- Candidate fixtures can execute the exact production progress adapter and assert SphenPad-only SVG behavior.
- Fog mask bounds derived from live `getBBox()` are canonicalized structurally; the fog path, masking relationships, final viewBox and raster remain compared. This removes sub-pixel browser text-metric noise.
- An attempted multi-digit Sudorkle coordinate fixture was removed because captured stock SudokuPad 0.612.0 itself rejects that syntax. SphenPad is not being extended beyond the compatibility target merely to satisfy a test.

## Production board settings wiring

`SudokuPadBoard` now consumes `sudokuPadBoardClassNames(scene)` from `src/sudokupad/app/boardClasses.ts`. The same helper is exercised by the oracle. `labels + compact marks` and `dark + grid/outline settings` both remain exact after this refactor.

## Environment boundary

This sandbox still lacks a complete install of the React/Vite dependency tree, so Phase 9C does not mount the React component itself in a built application. The behavioral production path underneath that component (`sceneWithPuzzleProgress` → board settings classes → native renderer → fog/assets) is exercised directly in Chromium. A clean dependency install, actual production build, React browser integration and deployment smoke test remain Phase 10 hardening tasks.

## Evidence

- `reports/phase9c-shard-cell.json`
- `reports/phase9c-shard-fog.json`
- `reports/phase9c-shard-controls.json`
- `reports/phase9c-boardclasses.json`
- `reports/sudokupad-phase9c-progress-integration.json`
