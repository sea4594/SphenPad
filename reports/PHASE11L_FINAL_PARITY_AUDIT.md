# Phase 11L — final SudokuMaker parity audit and production hardening

## Release conclusion

- **47/47** inventoried upstream SudokuMaker first-class tool types are exposed in the SphenPad creator and exercised by the Phase 11L executable parity audit.
- The 47 upstream rows map to **50 SphenPad authoring IDs/variants** because Thermometer, Whisper, and Entropy-style lines expose multiple native presets.
- Core creator workflows are wired end-to-end: project lifecycle/persistence/account sync, grid authoring, object editing, validation/solver, import/export, real SphenPad playtest, My Puzzles reopening, and 11K editing UX.
- **Intentional limitation:** SudokuMaker `Custom` constraints can execute author-supplied backend code in its worker. SphenPad stores and round-trips this code, exposes its definition/input/components, reports the limitation in validation/export, and never silently treats it as checked; it does **not execute arbitrary author JavaScript locally**. This is a security boundary, not an accidental missing mapping.
- The dependency-backed Vite/ESLint/browser release gate could not be run in this execution environment because `npm ci` cannot complete. A committed `npm run finish-phase11-release` gate now performs that final production check in GitHub Actions or any normal networked checkout.

## Tool-by-tool matrix

| Upstream type | Code | SphenPad authoring mapping | Final audit |
|---|---:|---|---|
| Givens | 0 | `given-digits` | PASS |
| Regions | 1 | `regions` | PASS |
| DiagonalMinus | 10 | `negative-diagonal` | PASS |
| DiagonalPlus | 11 | `positive-diagonal` | PASS |
| Antiking | 12 | `antiking` | PASS |
| Antiknight | 13 | `antiknight` | PASS |
| DisjointGroups | 14 | `disjoint-groups` | PASS |
| Nonconsecutive | 15 | `nonconsecutive` | PASS |
| GlobalEntropy | 16 | `global-entropy` | PASS |
| Even | 100 | `even` | PASS |
| Odd | 101 | `odd` | PASS |
| Maximum | 102 | `maximum` | PASS |
| Minimum | 103 | `minimum` | PASS |
| Difference | 200 | `difference-kropki` | PASS |
| Ratio | 201 | `ratio-kropki` | PASS |
| XV | 202 | `xv` | PASS |
| Thermometer | 300 | `thermometers`, `slow-thermometers` | PASS |
| KillerCages | 301 | `killer-cages` | PASS |
| Clone | 302 | `clones` | PASS |
| Quadruple | 303 | `quadruples` | PASS |
| LookAndSayCages | 304 | `look-and-say-cages` | PASS |
| DifferentValues | 305 | `different-values` | PASS |
| CountingCircles | 306 | `counting-circles` | PASS |
| Renban | 400 | `renban-lines` | PASS |
| Whisper | 401 | `german-whispers`, `dutch-whispers` | PASS |
| Palindrome | 402 | `palindromes` | PASS |
| BetweenLines | 403 | `between-lines` | PASS |
| RegionSumLine | 404 | `region-sum-lines` | PASS |
| Sequence | 405 | `sequence-lines` | PASS |
| EntropyLines | 406 | `entropic-lines`, `3-modular-lines`, `parity-lines` | PASS |
| LockoutLines | 407 | `lockout-lines` | PASS |
| Arrow | 408 | `arrows` | PASS |
| DoubleArrow | 409 | `double-arrows` | PASS |
| LittleKillers | 500 | `little-killers` | PASS |
| SandwichSums | 501 | `sandwich-sums` | PASS |
| XSums | 502 | `x-sums` | PASS |
| Skyscrapers | 503 | `skyscrapers` | PASS |
| NumberedRooms | 504 | `numbered-rooms` | PASS |
| RowIndexer | 600 | `row-indexers` | PASS |
| ColumnIndexer | 601 | `column-indexers` | PASS |
| Custom | 1000 | `custom-constraint` | LIMITED — code preserved, not executed |
| CosmeticLine | 2000 | `cosmetic-lines` | PASS |
| CosmeticCage | 2001 | `cosmetic-cages` | PASS |
| CosmeticSymbol | 2002 | `cosmetic-symbols` | PASS |
| SudokuRules | 2003 | Explicit base-rule toggle | PASS |
| FogLights | 4000 | `fog-lights` | PASS |
| FogTriggers | 4001 | `custom-fog-clearing` | PASS |

## End-to-end evidence

- `scripts/test-creator-phase11-release.ts` creates/exercises every mapped tool family, converts through `CreatorProject`, projects to SudokuPad/SCL, runs worker validation, and verifies all 47 upstream rows were covered.
- `scripts/test-creator-phase11-release-ui.mjs` verifies every inventory mapping is actually exposed by `PuzzleEditorPage` and checks the critical project/persistence/account/validation/interchange/playtest/My Puzzles/editing UX wiring.
- Existing focused tests for 11A–11K are rerun together in 11L, including v3→v4 authored migration, storage conflict/tombstone behavior, grid resize and multi-digit solutions, object editing, each semantic family, worker/solver behavior, interchange/loss reports, playtest rebasing/isolation, and 11K editing operations.
- Phase 1–10 dependency-free compatibility checks are rerun: SudokuPad proxy unit tests, asset resolver tests, font-loader tests, and pinned compatibility-manifest integrity.

## Production hardening

- Added `npm run test-creator-phase11` to run the complete creator regression matrix.
- Added `npm run finish-phase11-release` / `scripts/finish-phase11-release.sh` for the full networked release gate: clean install, production audit, lint, build, all creator tests, built artifact integrity/cleanliness, browser smoke, Phase 1–10 proxy/assets checks, pinned target verification, and final release hashes.
- Added `npm run write-phase11-release-hashes` to record production/source/test hashes and built bundle hashes when `dist/` exists.
- No new runtime dependency was added and `package-lock.json` remains unchanged.

## Live deployment readiness

The repository already contains a GitHub Pages workflow (`.github/workflows/deploy.yml`) that runs `npm ci` + `npm run build` and deploys `dist/` from `main`. The expected configured URL in this checkpoint is `https://sea4594.github.io/SphenPad/`. The live deployment step should run the dependency-backed release gate first, then push/merge this Phase 11L checkpoint to `main` and let the Pages workflow deploy it.
