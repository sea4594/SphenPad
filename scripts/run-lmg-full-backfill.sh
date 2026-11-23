#!/usr/bin/env bash
# GitHub Actions only: a bounded set of independently committed, resumable batches.
set -euo pipefail

if [[ "$(git branch --show-current)" != main ]]; then
  echo 'ERROR: Full LMG Backfill must run on main.' >&2
  exit 1
fi

BATCH_COUNT="${LMG_BATCHES_PER_JOB:-10}"
if ! [[ "$BATCH_COUNT" =~ ^[0-9]+$ ]] || ((BATCH_COUNT < 1 || BATCH_COUNT > 20)); then
  echo 'ERROR: Invalid LMG_BATCHES_PER_JOB.' >&2
  exit 1
fi

: "${LMG_MAX_LIST_PAGES_PER_RUN:=40}"
: "${LMG_MAX_DETAILS_PER_RUN:=200}"
: "${LMG_MAX_NEW_PUZZLES_PER_RUN:=180}"
: "${LMG_BACKFILL_CONCURRENCY:=4}"
: "${LMG_BACKFILL_DELAY_MS:=400}"
export LMG_MAX_LIST_PAGES_PER_RUN LMG_MAX_DETAILS_PER_RUN
export LMG_MAX_NEW_PUZZLES_PER_RUN LMG_BACKFILL_CONCURRENCY LMG_BACKFILL_DELAY_MS
export LMG_SYNC_MODE=backfill

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

complete=false
made_progress=false
for (( batch=1; batch<=BATCH_COUNT; batch++ )); do
  echo "===== LMG full backfill batch $batch/$BATCH_COUNT ====="
  node scripts/sync-lmg-cache.mjs

  read -r complete progress summary < <(node --input-type=module -e '
    import { readFileSync } from "node:fs";
    const a = JSON.parse(readFileSync("reports/lmg-catalog-audit.json", "utf8"));
    const brief = `entries=${a.discoveredPuzzles},hosted=${a.publishedEntries},pendingDetails=${a.pendingDetailPages},pendingPayloads=${a.pendingPayloads}`;
    console.log(a.backfillComplete ? "true" : "false", a.backfillProgress ? "true" : "false", brief);
  ')
  echo "LMG progress: $summary; finished=$complete; advanced=$progress"

  if [[ "$progress" != true && "$complete" != true ]]; then
    echo 'ERROR: No historical backfill progress. Stopping instead of rerunning indefinitely.' >&2
    exit 1
  fi

  git add -- public/lmg reports/lmg-catalog-audit.json
  git diff --cached --check
  if ! git diff --cached --quiet; then
    git commit -m "chore: checkpoint LMG historical backfill ($batch/$BATCH_COUNT)"
    git fetch origin main
    if ! git rebase origin/main; then
      git rebase --abort || true
      echo 'ERROR: LMG backfill rebase conflict; no force push.' >&2
      exit 1
    fi
    git push origin HEAD:main
  fi

  if [[ "$progress" == true ]]; then made_progress=true; fi
  if [[ "$complete" == true ]]; then
    echo 'LMG historical first pass is complete. Failed links remain in the retry audit.'
    break
  fi
done

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "complete=$complete"
    echo "made_progress=$made_progress"
  } >> "$GITHUB_OUTPUT"
fi

echo "Backfill batches finished: complete=$complete, made_progress=$made_progress"
