# SudokuPad Phase 10B — 1,000-puzzle production conformance sample

Target: SudokuPad 0.612.0 captured HAR.

## Corpus

- 1,000 archive puzzles attempted from 4,051 total.
- Fixed seed: `106120`.
- Selection: all 21 unresolved Phase 9E heavy source IDs plus 979 uniformly sampled remaining archive puzzles.
- Exact selected IDs/indexes are in `reports/sudokupad-phase10b-corpus-manifest.json`.

## Frozen first pass

- 932 passed.
- 68 timed out.
- 0 completed cases had structural or raster mismatches.
- No renderer/importer changes were made during first-pass collection.

## Timeout resolution before fixes

- 27/68 timeouts passed on a larger-budget rerun.
- Of the remaining 41 heavy cases, 20 passed with a 45-second fixture budget.
- 3 completed with the same structural mismatch family.
- 18 remained performance-unresolved.

## Grouped compatibility fix

All 3 actual mismatches had the same cause: SphenPad's late `metadata.bgimage` SVG image was included in the final content-bounds measurement, adding one extra 16-unit snap/padding step around a background that stock does not use to expand puzzle bounds. The implementation now excludes only the metadata background image from that late measurement. The browser oracle also canonicalizes the known implementation detail that stock paints `metadata.bgimage` outside the serialized puzzle SVG while SphenPad keeps an equivalent SVG `<image>` for standalone rendering; raster comparison remains authoritative for the visual.

Post-fix: **3/3 exact structural passes**, with raster deltas of 0%, 0%, and effectively 0%.

## Performance-unresolved cases

18 cases are **not counted as passes**:

- 13 time out while rendering the captured stock SudokuPad reference.
- 5 originally timed out after stock completed and while the candidate stage was active. Candidate-only diagnosis refined those 5:
  - 2 complete candidate render+raster successfully when they are not sharing the same fixture timeout budget with stock.
  - 3 complete candidate rendering but exceed the diagnostic budget during PNG rasterization.

These are retained as explicit performance/reference-oracle cases for the final release gate rather than being reported as compatibility successes.

## Regression after grouped fix

- `captured-real`: PASS, exact SVG, 0 differing pixels.
- `labels-compact-marks`: PASS, exact SVG, 0 differing pixels.
- `dark-grid-settings`: PASS, exact SVG, 0 differing pixels.

## Final 10B result

- **1,000/1,000 requested archive cases attempted**.
- **982 definitive stock-vs-SphenPad browser comparisons pass**.
- **0 known compatibility failures remain among completed comparisons**.
- **18 performance-unresolved cases remain and are not counted as passes**.

Phase 10B is complete for the user-requested 1,000-puzzle sample scope. The 18 pathological performance cases carry into the final release gate.
