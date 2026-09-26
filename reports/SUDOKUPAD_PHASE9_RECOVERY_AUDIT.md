# SudokuPad Phase 9 Recovery Audit

Date: 2026-09-23

Target: captured stock SudokuPad **0.612.0**.

## Verdict

The recovered Phase 9 work is **real and useful, but Phase 9 was marked complete too early**.

The browser oracle exists, executes the captured stock application and the SphenPad compatibility renderer in Chromium, compares normalized SVG structure plus raster output, and has already found/fixed real parity bugs. However, the retained fixture/corpus coverage does not satisfy the repo's own conformance checklist or the earlier replacement outline.

Phase 9 is therefore **reopened**. Phase 10 should not be treated as the only remaining required phase until the missing Phase 9 coverage below is closed.

## Recovery/reference integrity

Authoritative recovered source snapshot SHA-256:

- `SphenPad-current-work.zip`: `3083836353d57fd60562fbd1e75def364dfe2623abbf10c3f1bf4968315276a9`

Current supplied SudokuPad references:

- normal HAR: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
- fog HAR: `00acd5a49eb5860bfa60ba09a59be87eea75459b0f62558129b79e4ba9189b69`
- extracted/uploaded `script.js`: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`

The `/script.js` bytes inside both HARs have exactly the same SHA-256 as the separately supplied `script.js`. `App.VERSION` in that script is `0.612.0`.

Current audit environment:

- Chromium `144.0.7559.96` (Debian build)
- Playwright `1.57.0`
- Beautiful Soup `4.14.3`
- Pillow `12.3.0`

The previous Phase 9 JSON recorded only `/usr/bin/chromium`, not the browser version or reference hashes. The runner now records these values so later runs can be traced precisely.

## What was freshly revalidated

### Captured stock puzzles

- Normal HAR captured puzzle `z417emg43r`: structural equality, **0 differing pixels**.
- Fog HAR captured puzzle `sandra-and-nala/search-and-surprise`: structural equality, **0 differing pixels**.

### Original 11-fixture synthetic gate

A first fresh recovery run exposed an oracle race: only **9/11** passed because stock `feature-labelrowscols.js` / `feature-compactmarks.js` and `feature-bgimage.js` can attach asynchronously after the base grid is already present. The old harness waited only for the grid, so it could snapshot stock before those feature-side effects were present. That explains why the recovered historical report could say 11/11 while a later run of the same code could produce different results.

The harness was fixed to wait for required asynchronous stock feature side effects and force the final stock layout/resize measurement before snapshotting. No SphenPad renderer behavior was changed.

After the harness fix, the original synthetic gate again passes **11/11**:

| Fixture | Structural | Different-pixel ratio |
|---|---:|---:|
| captured real HAR | exact | 0.000000 |
| primitives/outside | exact | 0.000382 |
| recognized features | exact | 0.000072 |
| labels + compact marks | exact | 0.000000 |
| dark/grid/outline settings | exact | 0.000000 |
| arrows above lines | exact | 0.000000 |
| Barbie route | exact | 0.000000 |
| static fog | exact | 0.000000 |
| Twemoji | raster-only by design | 0.001591 |
| metadata external background | exact | 0.000000 |
| Sudorkle final state | exact | 0.000000 |

### Fresh real archive sample

A fresh deterministic five-puzzle archive-only run also passed **5/5**:

- `00r3q84657`: 0.000000
- `e0yukfm7p9`: 0.000023
- `sudoku/4jmjMjfqM2`: 0.000043
- `sudoku/dHq6Q9nhhd`: 0.000000
- `zyxp8ylq4g`: 0.000000

This is evidence that the recovered oracle still works; it is not a sufficiently broad corpus gate.

## Why Phase 9 is incomplete

### 1. The repo's own quantitative gate was not met

`SUDOKUPAD_CONFORMANCE_CHECKLIST_0.612.0.md` explicitly calls for:

- **100+ synthetic unit fixtures**;
- combinational fixtures;
- **500+ real-puzzle regression corpus**.

The recovered browser evidence is 11 synthetic fixtures plus a five-puzzle archive sample. The 4,051/4,051 result is an **import** audit, not a browser render comparison.

### 2. The earlier renderer outline required every actual renderer branch

`SPHENPAD_SUDOKUPAD_REPLACEMENT_OUTLINE.md` says synthetic fixtures should cover every actual renderer branch and gives explicit minimum cases. The current browser suite only covers a subset.

| Area | Present browser coverage | Important retained gaps |
|---|---|---|
| Lines | waypoint, raw `d`, fractional/outside geometry | thickness=1 compatibility mutation, arbitrary safe SVG attrs, more opacity/attribute cases |
| Arrows | stroke + filled heads, custom length/angle/indent | default head length, tiny/short final segment, opacity, degenerate/short input |
| Rect/graphics | fill/stroke, rounded default, rotation, same-fill/stroke indirectly | explicit rounded radius, explicit opacity matrix, safe extra attrs |
| Text | ordinary, multiline, rotation, emoji, cage-label background indirectly | long/maxWidth, text stroke, text anchor, explicit small background cases, broader black/white normalization |
| Cage outlines | normal regions + one 3-cell killer/L-shaped cage | single-cell, concave, disconnected, long labels, hidden/no-style, windoku, extra-region, FP row/column/box indexer styles |
| Cells/marks | givens, center marks, corner marks, compact center marks | player-entered values, zero-is-ten, player color wedges, all pen drawings, given-center/corner class cases, 10-candidate sizing, precedence combinations |
| Feature recognition | Kropki, XV, palindrome, Sudoku-X | arrow sum, little killer, inequality, sandwich cage, Windoku browser fixtures |
| Fog | initial/static mask | ordinary value reveal, edge/corner reveal, triggered reveal, outside-grid clue + fog combination, dynamic clue/value precedence regression fixture |
| Backgrounds/assets | one mocked metadata background + Twemoji | hide-background toggle, opacity clamp/default matrix, target-layer variants, historical ID backgrounds, experimental backgrounds, `TmMBJj8jbr` hide behavior |
| Settings | dark, dashed grid, digit/line outlines, arrows-above-lines, row labels, compact marks, Barbie | large digits, alternate marks, hide colours, no grid, hide background, disable emoji, puzzle fonts, experimental mode, requested combinations such as custom-font + dark |
| Dimensions | 4x4 synthetic plus incidental real puzzles | deliberate rectangular, non-9x9, large 21x22, helper/blank active-bound label fixtures |
| F-Puzzles | converter parity exists from Phase 4 | no browser fixture per the **41** recognized F-Puzzles keys required by the conformance checklist |

The earlier Phase 9 plan also explicitly named combinations that are still absent, including **fog + outside clues**, **custom font + dark mode**, **historical backgrounds**, **experimental backgrounds**, and broader irregular-cage cases.

### 3. The current candidate harness bypasses production app integration

The browser oracle compiles the lower-level `src/sudokupad` modules and manually calls:

- `loadResolvedSudokuPadPayload()`;
- `renderSudokuPadScene()`;
- `applySudokuPadFogMasks()`;
- `applySudokuPadAssets()`.

That is excellent for isolating renderer parity, but it does **not** execute the real React production path through `GridCanvas` / `SudokuPadBoard` / `sceneWithPuzzleProgress`.

Therefore Phase 9 currently does not prove, in-browser, that production wiring correctly handles:

- SphenPad player values and notes;
- highlight/color wedges;
- pen/line marks and double-line rendering;
- fog updates driven by player progress;
- the production Sudorkle completion trigger;
- app-level settings/class wiring;
- the real production asset resolver/proxy path.

These should be covered by a small end-to-end SphenPad browser layer in addition to the isolated renderer oracle. This is also important for preserving SphenPad's existing controls while the SudokuPad renderer is replaced.

### 4. Diagnostic layers from the outline are missing

The second-pass outline says the differential suite should compare, in order:

1. decoded source object;
2. normalized render plan;
3. canonicalized SVG tree;
4. raster.

The retained Phase 9 runner currently compares only stages 3 and 4. Phase 3/4 source-level audits provide substantial decoder evidence, but the browser harness does not retain per-fixture source/render-plan snapshots such as `expected-source-puzzle.json` and `expected-render-plan.json`.

### 5. Oracle hardening was incomplete

Recovery audit found these harness issues:

- async stock feature initialization could race snapshots — **fixed in this recovery prep**;
- generated arrow marker IDs were not actually normalized despite the checklist saying they should be — **fixed in this recovery prep**;
- Python dependencies were not declared — **fixed with `tests/conformance/requirements.txt`**;
- reference HAR/script hashes and Chromium version were not recorded — **fixed**;
- secondary archive/fog runs could overwrite the canonical report — runner now supports explicit `--report-md` / `--report-json` paths and `--suite` selection;
- stock `pageerror` events are collected but currently not surfaced/failing; this still needs classification/hardening;
- root SVG attributes other than `viewBox` are intentionally removed by the structural normalizer, so production root classes/styles are not validated structurally;
- no CI/shard aggregation exists yet for the large corpus.

## Controls/markings preservation

No SphenPad gameplay control or marking behavior was changed during this recovery audit.

The recovered app still contains its existing value/center/corner modes, two-page highlight palette, line palette, center/edge line behavior, and `lineDoubleMode`. The SudokuPad-only render options `compactMarks` and `labelRowsCols` remain **off by default**.

The recovered Settings UI does not currently expose those two optional SudokuPad settings as user-facing toggles. That is a product/UX decision to make deliberately later; they should not silently replace SphenPad's current controls.

## Environment limitation

The isolated Phase 9 renderer compiler/oracle works in the current environment. A full `npm ci` / production app build cannot currently be re-established because this sandbox cannot resolve the npm/SheetJS network hosts needed by the lockfile. This is an environment/dependency-install blocker, not evidence of a source failure, and remains part of production hardening.

## Required continuation order

Before declaring Phase 9 complete:

1. expand the synthetic gate to branch-complete renderer coverage;
2. add the missing combinations and both historical/experimental asset cases;
3. add dynamic fog/progress fixtures and player-marking fixtures;
4. add one browser fixture per F-Puzzles recognized key or an equivalent proven branch-complete generated matrix;
5. add a small end-to-end production SphenPad board suite so renderer parity does not accidentally break SphenPad controls/wiring;
6. run at least the checklist's 500+ real-puzzle browser corpus, sharded and aggregated;
7. investigate every mismatch and preserve regression fixtures for every fix;
8. only then close Phase 9 and proceed to the remaining Phase 10 production/deployment/font/full-corpus work.

## Recovery baseline discipline

The recovered ZIP remains the immutable source snapshot. A separate working tree was created and initialized as a local Git repository before this audit, so all changes from the recovered state are now diffable. Functional renderer changes should be made only after a failing conformance fixture demonstrates the discrepancy.
