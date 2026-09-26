# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `progress`

Fixtures: **2** — passed **1**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `progress-sudorkle-complete` | PASS | True | 0.000000% | Production completion status creates stock final Sudorkle overlay |
| `progress-sudorkle-multidigit` | FAIL | — | — | Sudorkle parser supports multi-digit row/column coordinates |

Error for `progress-sudorkle-multidigit`: `Error('Page.evaluate: TypeError: object null is not iterable (cannot read property Symbol(Symbol.iterator))\n    at <anonymous>:5245:10\n    at Array.map (<anonymous>)\n    at P.sudorkleParse (<anonymous>:5245:6)\n    at P.sudorkleShow (<anonymous>:5255:29)\n    at window.__phase9AfterLoad (<anonymous>:16:16)\n    at eval (eval at evaluate (:290:30), <anonymous>:1:52)\n    at UtilityScript.evaluate (<anonymous>:297:18)\n    at UtilityScript.<anonymous> (<anonymous>:1:44)')`


## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
