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
