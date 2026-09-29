#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p reports
LOG="reports/PHASE11_DEPENDENCY_RELEASE_GATE.txt"
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

echo "Phase 11 dependency-backed release gate — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo

echo "[1/11] Clean dependency install"
npm ci

echo "[2/11] Production dependency security audit"
npm audit --omit=dev --audit-level=high

echo "[3/11] Lint"
npm run lint

echo "[4/11] Production build"
npm run build

echo "[5/11] Complete Phase 11 creator regression matrix"
npm run test-creator-phase11

echo "[6/11] Account sync regression checks"
npm run test-account-sync

echo "[7/11] Built artifact integrity + cleanliness"
npm run verify-production-build
npm run verify-production-bundle-clean

echo "[8/11] Built-app browser smoke"
npm run verify-production-browser

echo "[9/11] Phase 1-10 proxy / asset compatibility gates"
npm run test-sudokupad-proxy
npm run test-sudokupad-assets

echo "[10/11] Pinned SudokuPad compatibility target"
node scripts/verify-sudokupad-upstream-target.mjs --manifest-only

echo "[11/11] Phase 11 release hashes"
npm run write-phase11-release-hashes

echo
echo "PHASE 11 DEPENDENCY-BACKED RELEASE GATE PASSED"
