# Phase 10A — Production Environment and Asset Fidelity

Target: pinned stock **SudokuPad 0.612.0**.

Status: **implementation/hardening complete; external verification gates blocked in this sandbox**.

Phase 10A was deliberately limited to production environment, fonts/assets/proxy, clean build, and built-app smoke work. No puzzle-rendering algorithms or SphenPad gameplay controls were changed.

## Completed implementation

### Controlled proxy hardening

`edge/sudokupad-proxy-worker.js` now has explicit production safeguards:

- GET/OPTIONS only;
- configured CORS plus `X-Content-Type-Options: nosniff`;
- http/https assets only and no URL credentials;
- literal localhost/private/link-local/reserved IPv4 rejection;
- private/link-local IPv6 rejection;
- manual redirect following with every redirect target revalidated;
- five-redirect maximum;
- upstream timeout (`UPSTREAM_TIMEOUT_MS`, default 8000 ms);
- asset size limit (`MAX_ASSET_BYTES`, default 16 MiB), checked against both `Content-Length` and actual bytes;
- image/font MIME validation;
- upstream `Set-Cookie` removal on asset responses;
- bounded stock puzzle API forwarding.

`node scripts/test-sudokupad-proxy.mjs` passes and covers CORS/methods, private-network blocking, redirect-to-private rejection, MIME rejection, size limits, timeout, valid asset response, and puzzle forwarding.

### Client asset resolver tests

`node --experimental-strip-types scripts/test-sudokupad-asset-resolver.mjs` passes and covers:

- direct request failure -> controlled proxy fallback;
- cache reuse;
- MIME rejection;
- size rejection;
- timeout/abort;
- unsupported URL scheme rejection.

### Optional puzzle-font production policy

The exact 13 captured SudokuPad font filenames are now recorded in:

- `public/assets/fonts/sudokupad-font-manifest.json`
- `public/assets/fonts/README.md`

`fontLoader.ts` is **local-first**:

1. try the exact captured `/assets/fonts/<filename>` path from SphenPad itself;
2. if no permitted local binary is present, fall back through the controlled SudokuPad asset resolver/proxy.

This allows permissively licensed fonts to be hash-pinned/local-hosted while avoiding redistribution of restrictive fonts.

`node scripts/verify-sudokupad-font-assets.mjs` validates file presence, sfnt signature, byte size, and SHA-256. `--require-all` is the release gate and `--update-hashes` records verified pins after the exact binaries are obtained.

`npm run test-sudokupad-assets` passes, including local-font success and remote/proxy font fallback behavior.

### Real external-asset inventory

The cached native archive was decoded rather than using synthetic URLs. Nine real `metadata.bgimage` URLs were found and recorded in:

- `reports/sudokupad-phase10a-external-assets.json`

The two hard-coded stock historical image paths are also recorded there:

- `/images/puzzles/TmMBJj8jbr.png`
- `/images/puzzles/monopolysudoku.png`

`node scripts/verify-sudokupad-external-assets.mjs` is the live production verifier for those real URLs.

### Production build smoke tooling

`node scripts/verify-production-build.mjs` verifies a built `dist/index.html`, root mount, and every emitted asset reference after `npm build` succeeds.

The Phase-9 browser oracle was rerun after the Phase-10A source changes:

- `captured-real`: exact structure, **0 differing pixels**;
- `fpuz-font-explicit`: exact structure, **0 differing pixels**.

So the production-asset changes did not regress the captured renderer path.

## External verification blockers in this runtime

These are environment limitations, not accepted release passes.

### 1. Exact 13 font binaries unavailable

The supplied HAR does not contain the font binary responses and the recovery tree contains no `.ttf`/`.otf` copies. The exact captured filenames are known, but their bytes cannot be hash-pinned or glyph-tested until they are obtained.

License triage also shows that several matching public font distributions are personal-use/demo/commercial-license material. Therefore Phase 10A intentionally does **not** copy third-party binaries from random mirrors into the repository. Redistribution/web-hosting rights must be confirmed per exact binary before local bundling.

Current verifier result: **13/13 missing**, which is expected and intentionally fails `--require-all`.

### 2. Sandbox has no usable outbound asset networking

The nine real archive image hosts could not be reached here (`fetch failed`/timeout). The verifier and production proxy path are ready, but live URL success must be exercised in a networked deployment/test environment.

### 3. npm registry unavailable, so clean build cannot be executed here

`npm ping` fails with DNS `EAI_AGAIN` for `registry.npmjs.org`. A clean `npm ci` cannot finish and `npm run build` consequently stops before Vite because dependency/type packages are absent.

This means the actual React/Vite built-app browser smoke gate remains **unexecuted**, not passed.

## Required Phase-10A closure gates in a networked environment

Before release, all of these must pass:

1. Obtain each exact SudokuPad 0.612.0 font binary from an authoritative/permitted source.
2. Confirm redistribution/web-embedding rights per binary.
3. For locally hosted permitted fonts, run `npm run verify-sudokupad-fonts -- --update-hashes` and commit the SHA-256 pins.
4. Run `npm run verify-sudokupad-fonts -- --require-all` for the chosen production font strategy, or explicitly document fonts that must remain proxy/upstream-served because redistribution is not allowed.
5. Browser-render all 13 font choices against stock using the exact binaries.
6. Run `npm run verify-sudokupad-external-assets` with outbound network access and exercise those URLs through the deployed proxy.
7. Deploy/configure the worker and repeat proxy smoke tests against the deployed endpoint.
8. Run clean `npm ci`, `npm run build`, built-app integration tests, and `npm run verify-production-build`.

Only after those external gates pass should Phase 10A be marked fully complete.

## Networked closure command

A single deterministic closure command is now provided:

```text
npm run finish-phase10a-networked
```

It performs the clean install, exact upstream-font byte/hash verification, nine-real-background verification, proxy/asset tests, production build, emitted-build validation, headless built-app React smoke test, and lint. See `reports/SUDOKUPAD_PHASE10A_NETWORKED_HANDOFF.md`.

Because this runtime still returns DNS `EAI_AGAIN` for the npm registry and cannot reach the real asset/font hosts, this command cannot be truthfully marked passed here. No additional implementation work is hidden behind that blocker.

## Networked closure attempt 1 — 2026-09-24

A networked macOS run successfully closed the previously blocked network gates:

- clean `npm ci`: dependency installation completed;
- proxy and asset/font-loader unit tests: passed;
- exact upstream SudokuPad optional font bytes: 13/13 fetched, sfnt-validated, and SHA-256 recorded/pinned in `public/assets/fonts/sudokupad-font-manifest.json`;
- real archive external background URLs: 9/9 fetched successfully.

The run then reached the production TypeScript/Vite build and exposed six compile-time source issues (five unused declarations/imports and one `erasableSyntaxOnly` constructor-parameter-property incompatibility). Those six source issues have been corrected in the subsequent checkpoint. A second networked closure run is required to verify the production build and downstream built-app/browser/lint gates and to surface any additional compile errors, if present.
