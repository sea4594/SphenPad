# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **25** — passed **23**, failed **2**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:yavvjksg60` | PASS | True | 0.000000% | Archive file index 3947 |
| `archive:ybaev4x39i` | FAIL | — | — | Archive file index 3948 |

Error for `archive:ybaev4x39i`: `TimeoutError()`

| `archive:yeb6vd8pem` | PASS | True | 0.000000% | Archive file index 3955 |
| `archive:yffxa7cuz1` | PASS | True | 0.000000% | Archive file index 3956 |
| `archive:yg5hbdwc6j` | PASS | True | 0.027322% | Archive file index 3957 |
| `archive:yjy08cqz6p` | PASS | True | 0.000000% | Archive file index 3962 |
| `archive:ykcj1iv01r` | PASS | True | 0.000000% | Archive file index 3964 |
| `archive:yl0n45rfll` | PASS | True | 0.000000% | Archive file index 3966 |
| `archive:yp4js8z1ck` | PASS | True | 0.000000% | Archive file index 3970 |
| `archive:yp4utzkw3i` | PASS | True | 0.000000% | Archive file index 3971 |
| `archive:yttrio/sightline-sum-whisper-loop` | PASS | True | 0.000000% | Archive file index 3980 |
| `archive:yya40q1u23` | PASS | True | 0.011903% | Archive file index 3992 |
| `archive:yymnj1pfww` | PASS | True | 0.001732% | Archive file index 3993 |
| `archive:z14kvlwqlh` | PASS | True | 0.000000% | Archive file index 3995 |
| `archive:z417emg43r` | PASS | True | 0.000000% | Archive file index 4001 |
| `archive:z7cztf0wsy` | PASS | True | 0.000000% | Archive file index 4005 |
| `archive:z7oxi1ve8x` | PASS | True | 0.000000% | Archive file index 4008 |
| `archive:zaputh99gx` | PASS | True | 0.000000% | Archive file index 4011 |
| `archive:zetamath/angel` | PASS | True | 0.000000% | Archive file index 4016 |
| `archive:zhsltyic9o` | PASS | True | 0.000000% | Archive file index 4024 |
| `archive:zrk69de373` | PASS | True | 0.000000% | Archive file index 4035 |
| `archive:zsk8n4tjvw` | PASS | True | 0.000000% | Archive file index 4038 |
| `archive:zsmtekox43` | FAIL | — | — | Archive file index 4039 |

Error for `archive:zsmtekox43`: `TimeoutError()`

| `archive:zsmxjt7v5i` | PASS | True | 0.028134% | Archive file index 4040 |
| `archive:zyutsxhylp` | PASS | True | 0.014608% | Archive file index 4048 |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
