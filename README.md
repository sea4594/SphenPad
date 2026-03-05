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

This repo includes a workflow at `.github/workflows/deploy.yml`.
On every push to `main`, GitHub Actions builds and deploys `dist/` to GitHub Pages.

Expected site URL:

- `https://sea4594.github.io/SphenPad/`

If the URL does not appear immediately, in GitHub go to:

- `Settings -> Pages`
- Ensure `Source` is set to `GitHub Actions`

Then re-run the workflow from the `Actions` tab if needed.
