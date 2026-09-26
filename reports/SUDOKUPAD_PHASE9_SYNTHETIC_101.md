# SudokuPad Phase 9 Synthetic Browser Gate — 101 Fixtures

Target: captured stock SudokuPad 0.612.0.

Status: **Phase 9B synthetic branch gate complete.**

The durable browser-conformance suite now defines 101 synthetic fixtures. New Phase 9B coverage was executed in bounded shards against captured stock SudokuPad and the SphenPad renderer in the same Chromium. All newly added fixtures passed their configured structural/raster gates.

Coverage added/revalidated in Phase 9B includes:

- known parity regressions: explicit `roundedRadius`, large-digits + alternate-marks 9-candidate sizing, no-grid;
- authored cage ordering and custom-colored box cages;
- killer cage single-cell, concave, disconnected, hidden, long-label and custom-text-color cases;
- windoku, extra-region, selection and FP row/column/box-indexer cage styles;
- center/corner mark count and placement cases, given mark classes/precedence, `zeroisten` rule behavior;
- large digits, alternate marks, hide colours, hide background, disable emoji and dashed+no-grid settings;
- deliberate 3x5, 6x4, 10x10 and 21x22 dimensions;
- arrow sum, little killer, inequality line/text, sandwich, both Sudoku-X diagonals, Windoku, Kropki black/white, and X/V/XV recognition;
- 38 primitive branch fixtures spanning line, arrow, rectangle and text geometry/style edge cases.

Confirmed renderer fixes exposed by the expanded gate:

1. preserve stock `roundedRadius` SVG attribute in addition to using it for geometry;
2. reproduce stock large-digit 9-candidate 65% CSS cascade;
3. preserve stock authored-cage-before-region insertion order;
4. drive `zeroisten` display behavior from puzzle `rules`, not `global` constraints;
5. reproduce generated Windoku cage paths in addition to the four canonical gray underlays.

Oracle hardening added during this work:

- stock settings are now injected through `Framework.getQuerySettings()` as well as `getSetting()`, matching the initialization path used by stock SudokuPad;
- hidden-background fixtures no longer incorrectly wait for a background element that stock intentionally suppresses.

The 101-fixture count satisfies the checklist's synthetic-quantity threshold, but Phase 9 remains open. Dynamic player/fog behavior, production React wiring, F-Puzzles browser branch coverage, and the 500+ real-puzzle browser corpus are separate required gates.
