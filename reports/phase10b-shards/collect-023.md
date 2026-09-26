# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **23**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/BgqJ2q46FL` | PASS | True | 0.000000% | Archive file index 2290 |
| `archive:sudoku/BjQP3L8QFr` | PASS | True | 0.000807% | Archive file index 2292 |
| `archive:sudoku/Bm3dMdPF8m` | PASS | True | 0.000000% | Archive file index 2293 |
| `archive:sudoku/BmMjB4Dt62` | PASS | True | 0.000000% | Archive file index 2295 |
| `archive:sudoku/BmdrRqggdn` | PASS | True | 0.000000% | Archive file index 2296 |
| `archive:sudoku/BnRMNhBr8N` | PASS | True | 0.000000% | Archive file index 2298 |
| `archive:sudoku/Btqp8DBmD7` | PASS | True | 0.000000% | Archive file index 2304 |
| `archive:sudoku/D4NtNg6tph` | PASS | True | 0.001623% | Archive file index 2310 |
| `archive:sudoku/D7fqF9rbgg` | FAIL | — | — | Archive file index 2314 |

Error for `archive:sudoku/D7fqF9rbgg`: `TimeoutError()`

| `archive:sudoku/DGjdPjDn9P` | PASS | True | 0.000000% | Archive file index 2319 |
| `archive:sudoku/DJ2BHjrDQT` | PASS | True | 0.000000% | Archive file index 2322 |
| `archive:sudoku/DMdfdnRGDf` | PASS | True | 0.011851% | Archive file index 2326 |
| `archive:sudoku/DMp47hdP2D` | PASS | True | 0.000000% | Archive file index 2327 |
| `archive:sudoku/DN7P93mMt9` | PASS | True | 0.000000% | Archive file index 2328 |
| `archive:sudoku/DQfnGdp3q2` | PASS | True | 0.000000% | Archive file index 2332 |
| `archive:sudoku/DbQMHDMhQP` | PASS | True | 0.000000% | Archive file index 2336 |
| `archive:sudoku/DbqfnTp2hR` | PASS | True | 0.000000% | Archive file index 2337 |
| `archive:sudoku/DfPhM8T7bD` | PASS | True | 0.000000% | Archive file index 2339 |
| `archive:sudoku/DgqqmmghFg` | PASS | True | 0.000000% | Archive file index 2341 |
| `archive:sudoku/Dh3pfFLfnJ` | PASS | True | 0.000000% | Archive file index 2343 |
| `archive:sudoku/DrDLbHmj6h` | FAIL | — | — | Archive file index 2355 |

Error for `archive:sudoku/DrDLbHmj6h`: `TimeoutError()`

| `archive:sudoku/DrpgPndfDd` | PASS | True | 0.000000% | Archive file index 2358 |
| `archive:sudoku/DtjRtL6Rrr` | PASS | True | 0.000000% | Archive file index 2362 |
| `archive:sudoku/F4nDB4d9h7` | PASS | True | 0.000000% | Archive file index 2371 |
| `archive:sudoku/F4rth2r3mP` | PASS | True | 0.000000% | Archive file index 2373 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
