# SudokuPad 0.612.0 Stock Feature Parity Audit

Target: the stock SudokuPad build captured in the supplied normal and fog HAR files.

## Result

- Captured `feature-*.js` modules audited: **37 / 37**
- Feature modules capable of altering puzzle SVG: **8**
- Finite authored-puzzle SVG features implemented: **7 / 7**
- Finite authored-render gaps found after fixes: **0**
- Explicit unbounded boundary: **`feature-userplugins.js`** — it executes arbitrary user JavaScript/CSS and is not a finite puzzle-payload format.

The audited finite SVG-affecting feature paths are:

1. Row/column labels (`feature-labelrowscols.js`) — implemented, including active-grid bounds and exact layer placement.
2. Fog (`feature-fog.js`) — implemented, including source normalization, hidden clues, trigger links and SVG masks.
3. Background images (`feature-bgimage.js`) — implemented, including target/opacity and external asset handling.
4. Compact candidates (`feature-compactmarks.js`) — implemented with the stock 5+-consecutive-value range rule.
5. `/barbie/` custom colors (`feature-customcolors.js`) — implemented.
6. Emoji (`feature-emoji.js`) — implemented using Twemoji-compatible SVG image replacement.
7. Puzzle fonts (`feature-puzzlefont.js`) — all 13 captured definitions, offsets, scale factors and legacy index mapping implemented.
8. User plugins (`feature-userplugins.js`) — intentionally excluded because arbitrary user JS/CSS is unbounded and is not stock puzzle-payload rendering.

All other captured feature modules were inspected and classified as input handling, gameplay overlays, application UI, or tooling rather than authored puzzle SVG.

## Core-code visual behavior checked outside `feature-*.js`

The audit also checked visual behavior implemented directly in the core application rather than a feature module. SphenPad now covers the finite cases found there, including:

- `metadata.sudorkle` completion overlay (final rendered state);
- historical ID-specific puzzle background images;
- experimental ID-specific backgrounds and the `TmMBJj8jbr` hiding behavior;
- settings-dependent arrows-vs-lines insertion order;
- dark-mode black/white SVG remapping;
- combined large-digit/alternate-mark CSS;
- 10-candidate CSS sizing;
- Kropki/XV dark-mode compatibility;
- content-derived viewBox expansion for outside-grid graphics.

## Full cached archive regression

The current unified importer was rerun over the complete repository archive after Phase-8 changes:

- Total cached puzzles: **4,051**
- Loaded successfully: **4,051**
- Failures: **0**
- Rectangular grids: **39**
- Non-9×9 grids: **296**
- Maximum rows: **21**
- Maximum columns: **22**
- Puzzles with outside-grid graphics: **682**
- Fog puzzles: **251**
- Triggered-fog puzzles: **115**
- Metadata background-image puzzles: **11**
- `norowcol` metadata puzzles: **15**
- `metadata.grids` puzzles in this archive: **0**

Machine-readable results are in `reports/sudokupad-archive-audit.json`.

## Unknown-field audit

The remaining warnings are preserved rather than silently discarded. The largest group is F-Puzzles keys such as `renban`, `whispers`, `nabner`, and `regionsumline` that are also **not consumed by the pinned stock SudokuPad F-Puzzles converter**. The Phase-4 converter comparison was exact on all 288 archived F-Puzzles payloads, so these are not SphenPad-vs-SudokuPad conversion discrepancies for the captured target build.

There are also 40 unknown native top-level occurrences, primarily `settings`. They remain retained in the scene/source compatibility data.

## Validation completed in this environment

- Strict TypeScript check of the SudokuPad compatibility modules: pass.
- Bounded TypeScript integration check of `SudokuPadBoard` + progress-to-scene adapter: pass.
- Complete archive import regression: 4,051 / 4,051 pass.
- Captured feature-file manifest coverage: 37 / 37, no missing/extra feature files.
- Phase-3 native feature-recognition oracle: 0 mismatches across 2,138 native archive puzzles.
- Phase-4 F-Puzzles converter oracle: 0 mismatches across all 288 archived F-Puzzles payloads.
- Phase-5 fog-normalization oracle: 0 mismatches across the full archive.
- Phase-7 RulesParser semantic oracle: 14,804 checks, 0 mismatches across 3,701 rule-bearing puzzles.

## What this audit does *not* yet prove

Source-level coverage and importer oracles are strong, but they are not a substitute for an actual browser-level rendering oracle. Before claiming empirical pixel-level parity, Phase 9 must run both the pinned real SudokuPad build and SphenPad in the same Chromium/font environment and compare normalized SVG plus raster output.

That browser conformance pass is especially important for:

- exact browser font metrics;
- SVG `getBBox()`-dependent text/background sizing;
- marker/stroke antialiasing;
- optional font binaries;
- external image loading;
- final fog masks in Chromium;
- dark-mode CSS cascade interactions;
- unusual combinations of otherwise individually verified primitives.

The only intentional non-finite compatibility exclusion is arbitrary user-installed JavaScript/CSS plugins.
