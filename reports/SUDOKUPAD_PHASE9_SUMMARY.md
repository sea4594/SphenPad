# SudokuPad Phase 9 Browser-Conformance Summary (Reopened)

Target: captured stock SudokuPad 0.612.0.

> **Recovery audit status (2026-09-23): Phase 9 is not complete.** The 11-fixture gate below is valid after an oracle race fix, but it is only a partial gate. The repo conformance checklist requires branch-complete synthetic coverage (100+ fixtures), combinational fixtures, and 500+ real browser-render comparisons. See `SUDOKUPAD_PHASE9_RECOVERY_AUDIT.md`.

## Browser oracle

Phase 9 adds `scripts/run-sudokupad-browser-conformance.py`. It reconstructs the stock application directly from the supplied HAR, executes it offline, compiles SphenPad's `src/sudokupad` compatibility layer into a browser test bundle, and renders both implementations in the same Chromium executable.

SVGs are compared structurally after removing only non-semantic root/generated-asset differences. Raster comparisons are performed by serializing each SVG and rerendering it in a clean page so SudokuPad dialogs, overlays, scaling, and animation timing cannot contaminate the result.

## Recovered initial synthetic gate

**11 / 11 fixtures pass after fixing an asynchronous stock-feature snapshot race.** This does not yet constitute branch-complete Phase 9 coverage.

| Fixture | SVG | Different-pixel ratio |
|---|---:|---:|
| captured real HAR puzzle | exact | 0.000000 |
| primitives + outside-grid content | exact | 0.000382 |
| recognized features | exact | 0.000072 |
| row/column labels + compact marks | exact | 0.000000 |
| dark/grid/outline settings | exact | 0.000000 |
| arrows-above-lines | exact | 0.000000 |
| Barbie route | exact | 0.000000 |
| fog final state | exact | 0.000000 |
| Twemoji | viewport-dependent structure; raster validated | 0.001591 |
| metadata external background | exact | 0.000000 |
| Sudorkle final state | exact | 0.000000 |

The pass threshold is a 0.002 (0.2%) materially-different-pixel ratio. Twemoji's serialized image bounds are intentionally not structurally compared because stock derives them from the current transformed board scale; its raster result remains below the same threshold.

## Real archive browser sample

A bounded five-puzzle deterministic sample spanning the cached archive passed both structural and raster checks:

- `00r3q84657`: 0.000000 pixel ratio
- `696hn2ntnb`: 0.000000 pixel ratio
- `T4FNnnm2RQ`: 0.000000 pixel ratio
- `sudoku/4jmjMjfqM2`: 0.000043 pixel ratio
- `zyxp8ylq4g`: 0.000000 pixel ratio

The full 4,051-puzzle **import** audit remains 4,051 / 4,051. Before Phase 9 is closed, at least the conformance checklist's 500+ real-puzzle browser gate must be run and investigated. A complete 4,051-puzzle sharded browser sweep remains part of production hardening.

## Bugs found by the oracle

1. Fixed detached `getBBox()` receiver in SphenPad content-bound calculation.
2. Added stock-equivalent second viewBox measurement after metadata background-image insertion.
3. Matched stock fog fade-group final opacity state.
4. Corrected fog clue/value precedence: hidden givens remain in the masked givens layer while entered values can render separately.
5. Improved Twemoji sizing to use browser-relative bounds and preserved stock `alt` text.
6. Removed false test failures caused by SudokuPad dialog blur, dark page backing, and restarted Sudorkle animations.

See `SUDOKUPAD_BROWSER_CONFORMANCE.md` and its JSON counterpart for the current synthetic gate, and the `_ARCHIVE_SAMPLE` reports for the real-puzzle sample.
