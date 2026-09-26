# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **22**, failed **3**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/LTMQhdn3b7` | FAIL | — | — | Archive file index 2632 |

Error for `archive:sudoku/LTMQhdn3b7`: `TimeoutError()`

| `archive:sudoku/LTdPqqtpFq` | FAIL | — | — | Archive file index 2633 |

Error for `archive:sudoku/LTdPqqtpFq`: `TimeoutError()`

| `archive:sudoku/LdgRt8ddjQ` | PASS | True | 0.000000% | Archive file index 2634 |
| `archive:sudoku/LfGHTrpjtb` | PASS | True | 0.005951% | Archive file index 2635 |
| `archive:sudoku/LgmnJJQRqf` | PASS | True | 0.005516% | Archive file index 2638 |
| `archive:sudoku/Lh2Jp3th27` | PASS | True | 0.000000% | Archive file index 2639 |
| `archive:sudoku/Lj72FhPr9B` | PASS | True | 0.000000% | Archive file index 2640 |
| `archive:sudoku/LnHb4hQ62N` | PASS | True | 0.001623% | Archive file index 2647 |
| `archive:sudoku/Lt8N8ThFTM` | PASS | True | 0.000000% | Archive file index 2649 |
| `archive:sudoku/Ltqp3P3BTJ` | PASS | True | 0.000000% | Archive file index 2650 |
| `archive:sudoku/M6bGJdtJFh` | PASS | True | 0.000000% | Archive file index 2653 |
| `archive:sudoku/M7N3GPRjtJ` | PASS | True | 0.000000% | Archive file index 2654 |
| `archive:sudoku/MF82TJGnB3` | PASS | True | 0.000000% | Archive file index 2663 |
| `archive:sudoku/MFhNMdnqJ8` | PASS | True | 0.000000% | Archive file index 2664 |
| `archive:sudoku/MGJ22FHQT6` | PASS | True | 0.000000% | Archive file index 2668 |
| `archive:sudoku/MHHnf7PDDQ` | FAIL | — | — | Archive file index 2669 |

Error for `archive:sudoku/MHHnf7PDDQ`: `TimeoutError()`

| `archive:sudoku/MM3mMQGJn2` | PASS | True | 0.000000% | Archive file index 2675 |
| `archive:sudoku/MNN7LtLL3G` | PASS | True | 0.000000% | Archive file index 2677 |
| `archive:sudoku/MQFjtH2mRh` | PASS | True | 0.000000% | Archive file index 2679 |
| `archive:sudoku/MQgGNRPLQB` | PASS | True | 0.000000% | Archive file index 2681 |
| `archive:sudoku/MRfqQRbHmB` | PASS | True | 0.004328% | Archive file index 2682 |
| `archive:sudoku/MTTm2LtHRG` | PASS | True | 0.000000% | Archive file index 2684 |
| `archive:sudoku/MTtdF66hqN` | PASS | True | 0.000000% | Archive file index 2685 |
| `archive:sudoku/MdmM24fgr9` | PASS | True | 0.004599% | Archive file index 2689 |
| `archive:sudoku/MfTJQdmQ8p` | PASS | True | 0.030116% | Archive file index 2690 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
