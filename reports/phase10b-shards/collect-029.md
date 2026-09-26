# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **25**, failed **0**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:sudoku/RM396Mnt7m` | PASS | True | 0.007574% | Archive file index 2894 |
| `archive:sudoku/RP7HfFgQdt` | PASS | True | 0.000000% | Archive file index 2899 |
| `archive:sudoku/RfjqGgLRht` | PASS | True | 0.002164% | Archive file index 2907 |
| `archive:sudoku/RmQ7hGm7BL` | PASS | True | 0.000000% | Archive file index 2911 |
| `archive:sudoku/RmhNHMBJGg` | PASS | True | 0.002164% | Archive file index 2913 |
| `archive:sudoku/Rmn2HpM9p8` | PASS | True | 0.002705% | Archive file index 2915 |
| `archive:sudoku/Rqr2gJgQMr` | PASS | True | 0.000000% | Archive file index 2920 |
| `archive:sudoku/Rt2NJGtt7b` | PASS | True | 0.000000% | Archive file index 2922 |
| `archive:sudoku/TDnjrGD6GQ` | PASS | True | 0.000000% | Archive file index 2936 |
| `archive:sudoku/TNGQtNP6jL` | PASS | True | 0.003787% | Archive file index 2946 |
| `archive:sudoku/TR6JQBMF6M` | PASS | True | 0.000000% | Archive file index 2951 |
| `archive:sudoku/TbMnngP7GJ` | PASS | True | 0.000000% | Archive file index 2954 |
| `archive:sudoku/TdBgH8fFdF` | PASS | True | 0.000000% | Archive file index 2956 |
| `archive:sudoku/TjdNrDhjd8` | PASS | True | 0.004869% | Archive file index 2963 |
| `archive:sudoku/Tpg4Php3p9` | PASS | True | 0.000465% | Archive file index 2969 |
| `archive:sudoku/TrFhNFqBLT` | PASS | True | 0.001394% | Archive file index 2973 |
| `archive:sudoku/b4qLdjD8LP` | PASS | True | 0.000000% | Archive file index 2981 |
| `archive:sudoku/b6qdJfmLb2` | PASS | True | 0.000000% | Archive file index 2982 |
| `archive:sudoku/b6tTH63QF9` | PASS | True | 0.000000% | Archive file index 2983 |
| `archive:sudoku/b86fhmTD8r` | PASS | True | 0.000000% | Archive file index 2984 |
| `archive:sudoku/bQgrmRR4HD` | PASS | True | 0.000000% | Archive file index 2999 |
| `archive:sudoku/bb9LH2T4jG` | PASS | True | 0.000000% | Archive file index 3004 |
| `archive:sudoku/bdhjghjb76` | PASS | True | 0.000404% | Archive file index 3009 |
| `archive:sudoku/bh74qbjB36` | PASS | True | 0.000000% | Archive file index 3010 |
| `archive:sudoku/bpN9rFng8p` | PASS | True | 0.000000% | Archive file index 3021 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
