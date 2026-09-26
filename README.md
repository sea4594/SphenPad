# SphenPad

SphenPad is a SudokuPad-inspired web app built with React + TypeScript + Vite.

## Local development

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
npm run preview
```

## Archive cache

The CtC archive page reads only local static data:

- `public/archive/archive-manifest.json` for archive metadata
- `public/archive/puzzles/*.json` for cached puzzle payloads

Refresh both caches locally with:

```bash
npm run sync-archive-cache
```

## Puzzle page controls

Only one tool panel is visible at a time:

- `Big`: place full-size digits.
- `Center`: place small centered notes.
- `Edge`: place small edge notes.
- `Highlight`: color selected cells.
- `Line`: draw continuous line paths between neighboring cells.

Line tool modes:

- `centers and edges (default)`
- `centers only`
- `edges only`

## GitHub Pages deployment

This repo includes two deployment-related workflows:

- `.github/workflows/deploy.yml`: builds and deploys on pushes to `main` (except archive cache-only changes).
- `.github/workflows/sync-data.yml`: runs on a ~6-hour schedule, refreshes archive cache data, commits cache updates, then builds and deploys.

Expected site URL:

- `https://sea4594.github.io/SphenPad/`

If the URL does not appear immediately, in GitHub go to:

- `Settings -> Pages`
- Ensure `Source` is set to `GitHub Actions`

Then re-run the workflow from the `Actions` tab if needed.

## Creator Phase 11 status

Creator Phase 11 is **complete through Phase 11L**. The final audit exercises all 47 inventoried SudokuMaker first-class tool types (50 SphenPad mappings/variants), along with project persistence/account sync, validation/solver tools, import/export, real SphenPad playtesting, Home/My Puzzles integration, and SudokuMaker-style editing UX. One intentional security limitation remains: Custom constraint backend JavaScript is preserved and explicitly reported, but arbitrary author code is not executed locally. See `MIGRATION_PROGRESS.md`, `reports/PHASE11L_FINAL_PARITY_AUDIT.md`, and `reports/PHASE11L_RELEASE_GATE.md`. Before a production/live deployment, run `npm run finish-phase11-release` in a networked environment so the dependency-backed lint/build/browser gate can pass.
