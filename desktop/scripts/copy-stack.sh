#!/bin/bash
set -euo pipefail
# Copy git-tracked stack resources (docker-compose.yml + backend/ + frontend/) 
# into src-tauri/stack/ for bundling into .app Resources.
# Runs from desktop/ before 'tauri build'.

REPO="$(cd "$(dirname "$0")"/../.. && pwd)"

# Clean previous copy
rm -rf "$REPO/desktop/src-tauri/stack"
mkdir -p "$REPO/desktop/src-tauri/stack"

cd "$REPO"
git ls-files docker-compose.yml backend/ frontend/ | while IFS= read -r f; do
  d="$REPO/desktop/src-tauri/stack/$(dirname "$f")"
  mkdir -p "$d"
  cp "$f" "$REPO/desktop/src-tauri/stack/$f"
done

echo "copy-stack: $(find desktop/src-tauri/stack -type f | wc -l) files copied"
