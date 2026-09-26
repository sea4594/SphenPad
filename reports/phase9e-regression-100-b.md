# SudokuPad Browser Conformance

Target: **SudokuPad 0.612.0 captured HAR**

Reference HAR SHA-256: `12d6ffd3ec204ba14cb6d5aab3da98444be49438d5aab8b664fe1fde34d2ecca`
Reference `/script.js` SHA-256: `3c53d973ffa62d541e300be9fddb53f19c2a4cc32eb98769a54904240343c9fe`
Chromium: `Chromium 144.0.7559.96 built on Debian GNU/Linux 13 (trixie)`
Suite: `archive`

Fixtures: **20** — passed **19**, failed **1**.

| Fixture | Result | SVG | Pixel diff | Notes |
|---|---:|---:|---:|---|
| `archive:TB93qrfhjq` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:atfgvx1pgc` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:bba52ml2te` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:blobz/nurikabe-sight-lines` | FAIL | True | 0.234537% | Deterministic archive sample |
| `archive:bxd5hl6ipw` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:cgqcfwnwmi` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:d510hfne1x` | PASS | True | 0.004328% | Deterministic archive sample |
| `archive:dkjeovl1up` | PASS | True | 0.006492% | Deterministic archive sample |
| `archive:e7g39h4vyj` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:f93bjjsyai` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:fosir7x3ud` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:fpuzN4IgzglgXgpiBcBOANCALhNAbO8QHYB6AJn3gAIAVACxnIGEBDMbOgQUc4CceeBzPtWohUjAK5pqAey4IQABWoQsEAA7kAcjADuAW0YA7ESC5icYGGjkaZ%2BrOTBiAJlIDWY8qfPlGq1VgBPADoAHQMAMRk0LhgwMAoAEQg%2BTDByCANyPhiA8gBjGCwsNN0xFnIAIzpsmEY0GC5ySUNyJ2TU9Myo6T4pA0Yi3MYnACtGAoM0cm0levzC4qDjbIgnBABtddAANwGxXBQQFO2YI3ho%2FYBfZGBr25u7x4fnnb3cAA5UY9OEC5hLgC6yC2T3uryw%2BwQh2%2BZz%2BoPhDyBIJedxAuwhuAAbF8ICdYaZ%2Fi80W8EABWHF434EhG3JFg1HoyHwYgUn7nalExm4ADMrPxV05JPg5KOuLZcJRdJpxIxCAALHyqQKwTKmSzRZT2cr4VLBbL4LyNeKOSquQgAIyKrWE01ChVG%2Fk2x66%2Bk3VU8q0S236%2B0wpVOyXA13BhlCz4O%2F00wFB90IbER61RlHJ8FM%2FCe6kAoEgfQADwgpV0G1ABSKcgASsR6HKQKjS1gK1XMbW3fWK3L6O8WyWFhXMZ3uyA23hy%2B96M2672R2Oa5OyyP%2B8RB8OQOWO0u5w2R%2Fh6KTl1PV6T6Nz9%2FPV9zd6et4f6Pgr%2B3q%2FeF4%2FN33x0%2FVx2J62D%2BWj%2BaP3Lc1L1fEdEBAn8z3LC8T1Am9EEAi87zg8sd1gyDr1Q29AKPPdo3AKQIQwPoNhQFlsUtBVeXTclPlo5AFTI5B00tbFeUtajkGxOjkCYhUFWxFlPl5FByRY5BPktckFXTcjkBE5jePk5ByVYhiJOQFkWXTFBeWxBVJJU5SFUtGiNJZFBsWxeiLOQDj1PwAFLiAA` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:gfjgpqtw7z` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:hMpJGmdHJ6` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:htkeovqz4k` | PASS | True | 0.005951% | Deterministic archive sample |
| `archive:iql7m9a36u` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:james-sinclair/craven-unshaded` | PASS | True | 0.002164% | Deterministic archive sample |
| `archive:jhwz7m5dbe` | PASS | True | 0.000000% | Deterministic archive sample |
| `archive:kzmsrodbh6` | PASS | True | 0.007845% | Deterministic archive sample |
| `archive:mNtG4hF28M` | PASS | True | 0.000000% | Deterministic archive sample |

## Interpretation

This oracle executes the captured stock SudokuPad JavaScript/CSS and the SphenPad renderer in the same installed Chromium. The stock page is fully inlined from the HAR, so the comparison does not depend on the current sudokupad.app deployment. Raster comparisons standardize the SVG to its viewBox dimensions before screenshots.

Optional puzzle-font binary verification remains a production-hardening task because those 13 binary files were not present in the supplied HAR.
