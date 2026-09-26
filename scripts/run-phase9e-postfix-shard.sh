#!/usr/bin/env bash
set -u
start="$1"; end="$2"; sample="${3:-600}"
args=()
for i in $(seq "$start" "$end"); do args+=(--archive-index "$i"); done
name=$(printf '%03d-%03d' "$start" "$end")
exec timeout 38s python3 scripts/run-sudokupad-browser-conformance.py \
  --har /mnt/data/sudokupad.app.har --suite archive --archive-sample "$sample" \
  "${args[@]}" --no-artifacts --skip-compile --fixture-timeout 4.5 \
  --report-json "reports/phase9e-postfix-${name}.json" \
  --report-md "reports/phase9e-postfix-${name}.md"
