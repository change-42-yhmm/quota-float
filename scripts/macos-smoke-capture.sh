#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:-/Applications/Quota Float.app}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${2:-$PWD/outputs/macos-smoke-$STAMP}"

mkdir -p "$OUT_DIR"

{
  echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "app_path=$APP_PATH"
  echo "uname=$(uname -a)"
  echo "arch=$(uname -m)"
  echo
  sw_vers
  echo
  system_profiler SPDisplaysDataType | sed -n '1,120p'
} > "$OUT_DIR/system.txt"

if [[ -d "$APP_PATH" ]]; then
  open "$APP_PATH"
else
  echo "App not found at: $APP_PATH" | tee "$OUT_DIR/app-missing.txt"
fi

echo "Move the collapsed orb to the test position, then press Enter."
read -r _
screencapture -x "$OUT_DIR/01-collapsed.png"

echo "Hover to expand the card, keep the mouse still, then press Enter."
read -r _
screencapture -x "$OUT_DIR/02-expanded.png"

echo "Move the mouse away and wait for collapse, then press Enter."
read -r _
screencapture -x "$OUT_DIR/03-collapsed-after-hover.png"

echo "Captured macOS smoke evidence in: $OUT_DIR"
