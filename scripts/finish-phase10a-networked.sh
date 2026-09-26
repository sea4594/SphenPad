#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

REPORT=reports/PHASE10A_NETWORKED_CLOSURE.txt
: > "$REPORT"
exec > >(tee -a "$REPORT") 2>&1

echo "Phase 10A networked closure — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Node: $(node --version)"
echo "npm: $(npm --version)"
echo

echo "[1/8] Clean dependency install"
npm ci

echo "[2/8] Proxy/unit asset tests"
npm run test-sudokupad-proxy
npm run test-sudokupad-assets

echo "[3/8] Exact upstream SudokuPad font-byte verification"
npm run verify-sudokupad-upstream-fonts

echo "[4/8] Real archive external-background verification"
npm run verify-sudokupad-external-assets

echo "[5/8] TypeScript/Vite production build"
npm run build

echo "[6/8] Built artifact integrity"
npm run verify-production-build

echo "[7/8] Built-app browser smoke"
npm run verify-production-browser

echo "[8/8] Lint"
npm run lint

echo
echo "PHASE 10A NETWORKED CLOSURE PASSED"
