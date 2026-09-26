# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **22**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/Mm6RRrPPN9` | PASS | True | 0.000000% | Archive file index 2698 |
| `archive:sudoku/MpBD3DHffF` | PASS | True | 0.000000% | Archive file index 2700 |
| `archive:sudoku/N2HF9P62qF` | PASS | True | 0.000000% | Archive file index 2704 |
| `archive:sudoku/N3fP8JrF2L` | PASS | True | 0.000000% | Archive file index 2705 |
| `archive:sudoku/N3gpdTdqTP` | PASS | True | 0.000000% | Archive file index 2706 |
| `archive:sudoku/N73tMp8QM8` | PASS | True | 0.000000% | Archive file index 2710 |
| `archive:sudoku/N8NmGQpmRF` | PASS | True | 0.000000% | Archive file index 2713 |
| `archive:sudoku/N8nqb36Hr9` | PASS | True | 0.005951% | Archive file index 2714 |
| `archive:sudoku/NBPBDTP64f` | PASS | True | 0.000000% | Archive file index 2720 |
| `archive:sudoku/NGbgngNgnd` | FAIL | — | — | Archive file index 2733 |

Error for `archive:sudoku/NGbgngNgnd`: `TimeoutError()`

| `archive:sudoku/NHQNdgPTQ6` | PASS | True | 0.000000% | Archive file index 2735 |
| `archive:sudoku/NLjTNfqmbM` | PASS | True | 0.007574% | Archive file index 2740 |
| `archive:sudoku/NQ8tN82JH6` | PASS | True | 0.000000% | Archive file index 2743 |
| `archive:sudoku/Ng7p8qtbLQ` | PASS | True | 0.000000% | Archive file index 2753 |
| `archive:sudoku/Nmg943btqh` | FAIL | — | — | Archive file index 2759 |

Error for `archive:sudoku/Nmg943btqh`: `TimeoutError()`

| `archive:sudoku/P2MgjGj6JF` | PASS | True | 0.005112% | Archive file index 2765 |
| `archive:sudoku/P39ddFHqjJ` | PASS | True | 0.000000% | Archive file index 2767 |
| `archive:sudoku/P6phpMtQfN` | PASS | True | 0.000000% | Archive file index 2772 |
| `archive:sudoku/P97Nt3HLmP` | PASS | True | 0.000000% | Archive file index 2776 |
| `archive:sudoku/PMJMhpmR8r` | PASS | True | 0.000000% | Archive file index 2788 |
| `archive:sudoku/PQh7M7fFtt` | PASS | True | 0.006492% | Archive file index 2791 |
| `archive:sudoku/Pf84Gn2GhL` | PASS | True | 0.000000% | Archive file index 2800 |
| `archive:sudoku/Pm2tG7mN8D` | PASS | True | 0.000000% | Archive file index 2802 |
| `archive:sudoku/Pm8N43nTMG` | FAIL | — | — | Archive file index 2804 |

Error for `archive:sudoku/Pm8N43nTMG`: `TimeoutError()`

| `archive:sudoku/PnnNbp7GHR` | PASS | True | 0.009198% | Archive file index 2808 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
