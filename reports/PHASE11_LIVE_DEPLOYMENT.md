# Phase 11 live playtest deployment

The repository is already configured for GitHub Pages.

Expected configured site URL:

`https://sea4594.github.io/SphenPad/`

## Required release/deploy sequence

1. Use a normal networked checkout of this Phase 11L checkpoint.
2. Run `npm run finish-phase11-release`.
3. Do not deploy if that gate fails; fix the reported lint/build/browser/test issue first.
4. Commit/push the Phase 11L checkpoint to the repository's `main` branch.
5. The existing `.github/workflows/deploy.yml` workflow will run `npm ci`, build the Vite app with the configured Firebase secrets, upload `dist/`, and deploy it to GitHub Pages.
6. In GitHub `Settings -> Pages`, the source must be `GitHub Actions`.
7. After the workflow succeeds, open the Pages URL and exercise Creator -> Playtest -> Creator plus Home/My Puzzles before treating the deployment as the live playtest build.

## Required GitHub repository secrets for account-backed behavior

The deploy workflow reads:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`

The site can still build without changing application source, but those existing project secrets should remain configured for the account/auth/sync flows intended by SphenPad.

## Phase 11 custom-code note

SudokuMaker Custom constraint backend JavaScript is preserved by SphenPad but is not executed locally. This intentional security limitation is reported by validation/export and should remain visible during live testing.
