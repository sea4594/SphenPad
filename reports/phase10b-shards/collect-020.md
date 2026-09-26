# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/3PNDfGd4d3` | PASS | True | 0.005140% | Archive file index 1953 |
| `archive:sudoku/3QPdQd6Grn` | PASS | True | 0.038954% | Archive file index 1954 |
| `archive:sudoku/3RJ64FJmQD` | PASS | True | 0.000000% | Archive file index 1957 |
| `archive:sudoku/3b6NHjDNMr` | PASS | True | 0.005410% | Archive file index 1960 |
| `archive:sudoku/3dn76m4hfp` | PASS | True | 0.000000% | Archive file index 1964 |
| `archive:sudoku/3n92Hf2fGQ` | PASS | True | 0.000000% | Archive file index 1975 |
| `archive:sudoku/48GGDrFGJm` | PASS | True | 0.006063% | Archive file index 1987 |
| `archive:sudoku/4H9bNPNQRr` | PASS | True | 0.001614% | Archive file index 1999 |
| `archive:sudoku/4HJbTHdMfn` | PASS | True | 0.000000% | Archive file index 2000 |
| `archive:sudoku/4JrqrrjDTd` | PASS | True | 0.000000% | Archive file index 2004 |
| `archive:sudoku/4N3ThH99qg` | PASS | True | 0.000000% | Archive file index 2008 |
| `archive:sudoku/4P97DPpdQ4` | PASS | True | 0.000000% | Archive file index 2010 |
| `archive:sudoku/4RjT2dp9HN` | PASS | True | 0.000000% | Archive file index 2011 |
| `archive:sudoku/4RnLTmTgR4` | PASS | True | 0.000000% | Archive file index 2012 |
| `archive:sudoku/4bJmfhdd9f` | PASS | True | 0.000000% | Archive file index 2014 |
| `archive:sudoku/4fhh3ngL9G` | PASS | True | 0.000000% | Archive file index 2017 |
| `archive:sudoku/4gn88G8Ftt` | PASS | True | 0.000000% | Archive file index 2019 |
| `archive:sudoku/4hGmbgHm4d` | PASS | True | 0.000000% | Archive file index 2022 |
| `archive:sudoku/4jmjMjfqM2` | PASS | True | 0.004328% | Archive file index 2025 |
| `archive:sudoku/4m7b7qNRn9` | PASS | True | 0.000000% | Archive file index 2026 |
| `archive:sudoku/4mH66tpGmM` | PASS | True | 0.000000% | Archive file index 2028 |
| `archive:sudoku/4qJrNJh6tP` | PASS | True | 0.009198% | Archive file index 2032 |
| `archive:sudoku/4r2BpLTLNG` | PASS | True | 0.000000% | Archive file index 2033 |
| `archive:sudoku/4rPjgJNdF2` | PASS | True | 0.003681% | Archive file index 2034 |
| `archive:sudoku/67dGMn7HbH` | PASS | True | 0.000000% | Archive file index 2041 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
