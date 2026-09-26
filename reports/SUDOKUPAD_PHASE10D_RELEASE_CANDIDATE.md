# Phase 10D — Release candidate status

Target: **SudokuPad 0.612.0**.

## Completed in the release candidate

- The 18 Phase 10B performance-unresolved cases have a formal release disposition. None is counted as a conformance pass; diagnostics identify 13 stock-reference performance cases, 2 isolated candidate passes, and 3 candidate-render-complete/PNG-raster-timeout cases. No contradictory rendered result is known.
- Production-surface cleanup removed the root temporary visual-audit script and the unused Vite placeholder asset. Conformance evidence remains under `reports/` and is not emitted by Vite.
- Final browser conformance gate: **8/8 pass** across ordinary rendering, fog, F-Puzzles, external background, custom-font setting/classing, Compact Marks + row/column labels, progress fog, and SphenPad double-line controls.
- The external-background synthetic oracle was hardened to model the real asynchronous FeatureBgImage timing instead of an instantaneous in-memory fetch race. Product renderer behavior was not changed by this final harness fix.
- The compatibility manifest passes offline validation: **67 pinned JS/CSS assets + 13 pinned font hashes**, and the authoritative normal HAR matches **67/67** web-asset hashes.
- A deterministic final closure command now performs clean install, lint, production build, built-artifact verification, Chrome/Chromium smoke, compatibility-manifest validation, and final dist hashing.

## Final environment-dependent gate

The current sandbox cannot complete npm dependency installation, so the post-10C production build/lint/browser-smoke must be executed in a normal networked environment with:

```bash
npm run finish-phase10d-release
```

A successful run ends with `PHASE 10D RELEASE CLOSURE PASSED` and writes `reports/PHASE10D_RELEASE_CLOSURE.txt` plus `reports/sphenpad-phase10d-built-manifest.json`.
