# Phase 10A — Networked Closure Handoff

All code-side Phase 10A work is implemented. The current ChatGPT sandbox cannot resolve `registry.npmjs.org` or the real external asset/font hosts, so the remaining release gates must be executed once in an ordinary networked environment.

No manual font hunting is required. `npm run finish-phase10a-networked` performs the closure in one command:

1. clean `npm ci`;
2. proxy/unit asset tests;
3. fetch and SHA-256 the exact 13 binaries served by `https://sudokupad.app/assets/fonts/...` without committing or redistributing them;
4. verify the nine real archive `metadata.bgimage` URLs;
5. run the TypeScript/Vite production build;
6. validate every emitted build asset;
7. serve `dist/` locally and launch installed Chrome/Chromium headlessly to prove the React production root mounts;
8. run lint.

The command writes:

- `reports/PHASE10A_NETWORKED_CLOSURE.txt`
- `reports/sudokupad-phase10a-upstream-fonts.json`

If Chrome is not installed in a standard location, set `CHROME_BIN=/path/to/browser` before running the command.

Exact font binary hashes are evidence only at this stage. Restricted fonts are intentionally not copied into the SphenPad repository. Phase 10C will pin the final compatibility-resource manifest and upstream-change policy.
