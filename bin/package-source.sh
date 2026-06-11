#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PARENT="$(cd "$REPO_ROOT/.." && pwd)"

PACKAGE_ROOT_NAME="${PACKAGE_ROOT_NAME:-new-api-plus}"
OUTPUT_DIR="${OUTPUT_DIR:-$PROJECT_PARENT}"
TIMESTAMP="${TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}"
ARCHIVE_NAME="${ARCHIVE_NAME:-${PACKAGE_ROOT_NAME}-source-${TIMESTAMP}.tar.gz}"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"

mkdir -p "$OUTPUT_DIR"
rm -f "$ARCHIVE_PATH"

tar -C "$REPO_ROOT" \
  --exclude='./.git' \
  --exclude='./.idea' \
  --exclude='./.run' \
  --exclude='./node_modules' \
  --exclude='./web/node_modules' \
  --exclude='./web/default/node_modules' \
  --exclude='./web/classic/node_modules' \
  --exclude='./temp' \
  --exclude='./logs' \
  --exclude='./data' \
  --exclude='./backups' \
  --exclude='./coverage' \
  --exclude='./dist' \
  --exclude='./build' \
  --exclude='./web/default/dist' \
  --exclude='./web/default/.rsbuild' \
  --exclude='./web/default/.cache' \
  --exclude='./web/classic/dist' \
  --exclude='./web/classic/.vite' \
  --exclude='./*.tar.gz' \
  --exclude='./*.db' \
  --exclude='./*.db-shm' \
  --exclude='./*.db-wal' \
  --transform="s,^\.$,${PACKAGE_ROOT_NAME}," \
  --transform="s,^\./,${PACKAGE_ROOT_NAME}/," \
  -czf "$ARCHIVE_PATH" .

echo "Archive: $ARCHIVE_PATH"
ls -lh "$ARCHIVE_PATH"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$ARCHIVE_PATH"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$ARCHIVE_PATH"
fi
