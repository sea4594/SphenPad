# Phase 10C — Compatibility lock and settings polish

Target: **SudokuPad 0.612.0**.

## Pinned compatibility resources

`public/assets/sudokupad-compatibility-manifest.json` pins the captured target by SHA-256:

- 67 SudokuPad-hosted JavaScript/CSS resources captured in the authoritative normal HAR;
- 13 optional SudokuPad puzzle-font binaries verified against the upstream filenames during Phase 10A;
- authoritative normal/fog HAR hashes and `/script.js` hash.

`npm run verify-sudokupad-upstream-target` compares the current upstream bytes with the pinned manifest. Any changed, missing, or unreachable resource is reported as drift/error. The command never rewrites the pinned target. `--manifest-only` validates the manifest without network access.

## Compatibility contract

SphenPad targets the **authored/static/final puzzle rendering and player-state behavior** of the captured stock SudokuPad 0.612.0 build for the supported finite puzzle formats/features documented by the conformance suite.

Covered by the compatibility claim:

- puzzle decoding/conversion for the recognized native/F-Puzzles branches;
- final SVG geometry, authored clues/cosmetics, values/marks, fog state, backgrounds and supported fonts;
- stock URL/render settings implemented by the renderer;
- final/static states of Sudorkle/fog effects;
- SphenPad player controls layered around the compatible renderer.

Not claimed as byte/frame-for-frame compatibility:

- transient animation timing/intermediate frames (for example fog transitions or Sudorkle flips);
- arbitrary user-installed SudokuPad JavaScript/CSS plugins;
- unrelated SudokuPad page/dialog/application chrome;
- third-party external asset availability at every moment.

The Phase 10B 1,000-puzzle sample produced no remaining known correctness mismatch. Eighteen pathological cases remain performance-unresolved in the browser oracle; diagnostics did not identify a contradictory rendered result. They remain a final-release performance/disposition item rather than being counted as compatibility passes.

## SphenPad settings

The following renderer conveniences are now exposed as persistent synced SphenPad preferences, defaulting **off**:

- Compact Marks
- Row/Column Labels

A puzzle's explicit SudokuPad URL settings remain authoritative over the corresponding SphenPad preference, matching existing dark-mode/outline-digit precedence. Existing SphenPad controls (selection/highlight color, number/mark modes, line colors, double-line behavior, conflict checker, etc.) are unchanged.
