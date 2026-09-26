# Phase 10D lint-gate fix

The first networked Phase 10D rerun cleared the production dependency audit but stopped at lint because ESLint scanned `tests/conformance/.build/`, a generated conformance compiler output directory.

`tests/conformance/README.md` already specifies that `.build/` is generated and should not be committed. This checkpoint therefore:

- carries forward the audited `package-lock.json` produced by `npm audit fix --package-lock-only --omit=dev --audit-level=high`;
- removes the generated `tests/conformance/.build/` tree from the release checkpoint;
- ignores `tests/conformance/.build/**` in ESLint;
- adds `tests/conformance/.build/` to `.gitignore`.

No application, renderer, puzzle-model, or test-source behavior was changed.
