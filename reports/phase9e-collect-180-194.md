# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **15** — passed **13**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:gx4cd1q3zo` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:h63cv2l7tp` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:hMpJGmdHJ6` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:hchxt4tcxs` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:hjmtg72jQq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ho51fykiy7` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:hr3yy4ec3p` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:htkeovqz4k` | PASS | True | 0.005951% | Deterministic archive sample |
| `archive:hxw93rhz53` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:i2r7za43kv` | FAIL | — | — | Deterministic archive sample |

Error for `archive:i2r7za43kv`: `TimeoutError()`

| `archive:i7jrq9g9oz` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ib3ewxrhep` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ifq6fsm9l3` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:ik85shpid7` | FAIL | — | — | Deterministic archive sample |

Error for `archive:ik85shpid7`: `TimeoutError()`

| `archive:iql7m9a36u` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
