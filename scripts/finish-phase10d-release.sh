#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p reports
LOG="reports/PHASE10D_RELEASE_GATE.txt"
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

echo "Phase 10D final release gate — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo
echo "[1/10] Clean dependency install"
npm ci

echo "[2/10] Production dependency security audit"
npm audit --omit=dev --audit-level=high

echo "[3/10] Lint"
npm run lint

echo "[4/10] Production build"
npm run build

echo "[5/10] Built artifact integrity"
npm run verify-production-build

echo "[6/10] Production bundle cleanliness"
npm run verify-production-bundle-clean

echo "[7/10] Built-app browser smoke"
npm run verify-production-browser

echo "[8/10] Proxy/asset unit gates"
npm run test-sudokupad-proxy
npm run test-sudokupad-assets

echo "[9/10] Pinned SudokuPad target integrity + live drift observation"
node scripts/verify-sudokupad-upstream-target.mjs --manifest-only
if npm run verify-sudokupad-upstream-target; then
  echo "Live upstream still matches the pinned target."
else
  echo "WARNING: live SudokuPad drift/network error detected. Release remains pinned to the captured 0.612.0 target; inspect before any future rebase."
fi

echo "[10/10] Final release hashes"
npm run write-phase10d-release-hashes

echo
echo "PHASE 10D RELEASE GATE PASSED"
