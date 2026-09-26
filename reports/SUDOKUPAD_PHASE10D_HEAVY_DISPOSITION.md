# Phase 10D — Heavy-case release disposition

Target: **SudokuPad 0.612.0 captured HAR**.

## Result

- **18 / 18** previously performance-unresolved cases complete SphenPad browser import/render/SVG serialization.
- **13** were reference-performance cases: captured stock SudokuPad exceeded the bounded comparison window, but SphenPad now passes candidate-only browser rendering for every one.
- **2** candidate-isolated cases complete render **and** PNG rasterization exactly when removed from the shared stock budget.
- **3** complete SphenPad rendering but remain slow only during the diagnostic PNG rasterization step.

These cases are therefore release-dispositioned as **oracle/reference/raster performance exceptions, not known app rendering failures**. They are not retroactively counted as stock-vs-SphenPad conformance passes because the stock side did not complete for those cases.

## Cases

- `archive:100ywt1d63` (archive index 38): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:27v1lv24c3` (archive index 109): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:7d9f9mb2y3` (archive index 439): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:7llvcaivec` (archive index 452): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:b193jegg4x` (archive index 791): **candidate-render+raster-pass** — Candidate-only render+raster completed exactly when isolated from the shared stock budget.
- `archive:eb90s76a4e` (archive index 1028): **candidate-render-pass/raster-performance** — SphenPad rendering completed; only PNG rasterization exceeded the diagnostic budget.
- `archive:esjz6meusc` (archive index 1055): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:gbwivexeh7` (archive index 1190): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:james-sinclair/stickiest-notes` (archive index 1364): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:jgdFdqhmn2` (archive index 1384): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:jw1onozqhg` (archive index 1400): **candidate-render-pass/raster-performance** — SphenPad rendering completed; only PNG rasterization exceeded the diagnostic budget.
- `archive:l01qpi8oc3` (archive index 1449): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:lhid2td2zu` (archive index 1459): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:lipt9yn6r4` (archive index 1460): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:p8ushghwpc` (archive index 1650): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:sudoku/Pm8N43nTMG` (archive index 2804): **candidate-render-pass/reference-performance** — Captured stock exceeded the bounded comparison window in Phase 10B; SphenPad candidate-only browser import/render/SVG serialization passes in Phase 10D.
- `archive:sudoku/jMQR24JRBN` (archive index 3271): **candidate-render+raster-pass** — Candidate-only render+raster completed exactly when isolated from the shared stock budget.
- `archive:sudoku/jfrf3mHRbN` (archive index 3286): **candidate-render-pass/raster-performance** — SphenPad rendering completed; only PNG rasterization exceeded the diagnostic budget.
