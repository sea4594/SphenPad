# Browser conformance oracle

`python scripts/run-sudokupad-browser-conformance.py` compares SphenPad against the captured stock SudokuPad 0.612.0 browser implementation.

The reference is reconstructed directly from a captured HAR: captured JavaScript/CSS/fonts are inlined into an offline page and the puzzle API response is mocked. The SphenPad side is compiled directly from `src/sudokupad` into a temporary CommonJS module registry and run in the same Chromium executable. Neither side uses the live SudokuPad deployment.

## Prerequisites

```bash
python -m pip install -r tests/conformance/requirements.txt
```

The runner expects a Chromium executable. Override it with `CHROMIUM_BIN=/path/to/chromium` or `--chromium`. It records the Chromium version plus SHA-256 hashes of the HAR and captured `/script.js` in each JSON report.

By default the reference HAR is `/mnt/data/sudokupad.app.har`. Override with `SUDOKUPAD_REFERENCE_HAR=/path/to/reference.har` or `--har`.

`tests/conformance/.build/` is generated and should not be committed.

## Useful commands

Synthetic gate only:

```bash
python scripts/run-sudokupad-browser-conformance.py \
  --suite synthetic \
  --archive-sample 0
```

F-Puzzles conversion matrix:

```bash
python scripts/run-sudokupad-browser-conformance.py \
  --suite fpuzzles \
  --archive-sample 0
```

Captured fog HAR smoke test without overwriting the canonical report:

```bash
python scripts/run-sudokupad-browser-conformance.py \
  --har /mnt/data/sudokupad.app_fog.har \
  --suite synthetic \
  --archive-sample 0 \
  --fixture captured-real \
  --report-md /tmp/sudokupad-fog.md \
  --report-json /tmp/sudokupad-fog.json
```

Archive-only sample:

```bash
python scripts/run-sudokupad-browser-conformance.py \
  --suite archive \
  --archive-sample 25 \
  --report-md /tmp/sudokupad-archive-25.md \
  --report-json /tmp/sudokupad-archive-25.json
```

The default outputs are:

- `reports/SUDOKUPAD_BROWSER_CONFORMANCE.md`
- `reports/sudokupad-browser-conformance.json`
- failing artifacts under `reports/conformance-artifacts/`

Use `--report-md` and `--report-json` for secondary/sharded runs so they do not overwrite the canonical synthetic report.

## Current scope

Phase 9B's 101-fixture synthetic renderer gate, Phase 9C's production progress/player-state integration gate, and Phase 9D's 57-fixture F-Puzzles browser matrix are complete. Phase 9 remains open only for Phase 9E: a sharded **500+ real-puzzle browser corpus**, with every unexplained mismatch promoted to a regression fixture/fix. See `reports/SUDOKUPAD_PHASE9_RECOVERY_AUDIT.md`, `reports/SUDOKUPAD_PHASE9C_PROGRESS_INTEGRATION.md`, and `reports/SUDOKUPAD_PHASE9D_FPUZZLES_BROWSER_MATRIX.md`.
