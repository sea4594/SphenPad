# SudokuPad optional puzzle fonts

This directory is the production-local location for the 13 optional puzzle fonts used by the pinned SudokuPad 0.612.0 compatibility target.

The repository intentionally does **not** include the font binaries unless their redistribution/web-hosting rights have been verified. `sudokupad-font-manifest.json` records the exact captured filenames and the expected SHA-256 pin slot for each binary.

Production policy:

1. Obtain the exact binary that SudokuPad 0.612.0 serves for the captured filename.
2. Confirm that web redistribution/embedding is permitted for SphenPad's deployment.
3. Place the binary here using the exact filename.
4. Run `npm run verify-sudokupad-fonts -- --require-all`.
5. Record its SHA-256 in `sudokupad-font-manifest.json` and commit the manifest update.
6. Re-run the browser font parity gate before release.

If a binary may not be redistributed, leave it out of this directory. SphenPad will fall back to the controlled asset resolver/proxy path, and the deployment must pin/allow that upstream strategy instead.
