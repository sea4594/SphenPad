# Phase 10D — Release cleanup and final gate

Target: **SudokuPad 0.612.0**.

## Completed locally

- Phase-10B performance disposition: **18 / 18** previously unresolved cases complete SphenPad browser import/render/SVG serialization. Thirteen are stock-reference performance cases; two also complete isolated render+raster; three complete rendering and are slow only in PNG rasterization.
- Representative final conformance: **8 / 8 pass**. Stock-comparable cases are structurally exact with **0 differing pixels**; the SphenPad-specific double-line control assertion also passes.
- Pinned captured target: **67 / 67** JS/CSS assets match the supplied SudokuPad 0.612.0 HAR. The compatibility manifest also pins the 13 exact verified font hashes.
- Conformance TypeScript bundle compile: **PASS**.
- Release cleanup: navigation debug `console.log` statements removed; font verification README/manifest moved out of `public/`; no `.md`, source-map, TypeScript, or Python files remain under `public/`.
- Added `verify-production-bundle-clean` to reject test/debug/conformance leakage from `dist/`.
- Added `write-phase10d-release-hashes` to hash production inputs and every emitted release file.
- Added one-command final release gate: `npm run finish-phase10d-release`.

## Final networked gate

The current sandbox cannot complete `npm ci`, so the dependency-backed final gate must run in a normal networked checkout. The gate performs, in order:

1. clean dependency install;
2. production-dependency security audit (`npm audit --omit=dev --audit-level=high`);
3. lint;
4. TypeScript/Vite production build;
5. emitted-asset integrity verification;
6. production-bundle cleanliness verification;
7. built-app Chrome/Chromium smoke test;
8. proxy and asset-loader unit gates;
9. pinned-target manifest integrity plus a non-rebasing live upstream drift observation;
10. final production input/bundle SHA-256 manifest.

A live SudokuPad drift/network warning does not silently rebase or invalidate the captured 0.612.0 target. The pinned manifest remains authoritative; future upstream drift triggers a re-audit decision.

Phase 10D is complete once this script reaches `PHASE 10D RELEASE GATE PASSED`.
