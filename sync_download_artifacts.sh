#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
DOWNLOADS_DIR="$ROOT_DIR/apps/backend/static/downloads"
BOOTSTRAP_DIST="$ROOT_DIR/apps/bootstrap_installer/dist"
AGENT_DIST="$ROOT_DIR/apps/desktop_app/dist"

mkdir -p "$DOWNLOADS_DIR"

cleanup_pattern() {
  pattern="$1"
  keep_file="$2"
  find "$DOWNLOADS_DIR" -maxdepth 1 -type f -name "$pattern" | while IFS= read -r file; do
    if [ "$file" != "$keep_file" ]; then
      rm -f "$file"
    fi
  done
}

copy_latest() {
  source_file="$1"
  target_file="$DOWNLOADS_DIR/$(basename "$source_file")"
  cp -f "$source_file" "$target_file"
  printf '%s\n' "$target_file"
}

BOOTSTRAP_MAC_ARM64="$BOOTSTRAP_DIST/Work Zilla Installer-mac-arm64-0.1.8.dmg"
BOOTSTRAP_MAC_X64="$BOOTSTRAP_DIST/Work Zilla Installer-mac-x64-0.1.8.dmg"
AGENT_MAC_ARM64="$AGENT_DIST/Work Zilla Agent-0.2.0-arm64.dmg"
AGENT_MAC_X64="$AGENT_DIST/Work Zilla Agent-0.2.0.dmg"
BOOTSTRAP_WIN_X64="$BOOTSTRAP_DIST/Work Zilla Installer-win-x64-0.1.8.exe"
AGENT_WIN_X64="$AGENT_DIST/Work Zilla Agent Setup 0.2.0.exe"

for required in \
  "$BOOTSTRAP_MAC_ARM64" \
  "$BOOTSTRAP_MAC_X64" \
  "$AGENT_MAC_ARM64" \
  "$AGENT_MAC_X64" \
  "$BOOTSTRAP_WIN_X64" \
  "$AGENT_WIN_X64"
do
  if [ ! -f "$required" ]; then
    echo "Missing required artifact: $required" >&2
    exit 1
  fi
done

BOOTSTRAP_MAC_ARM64_TARGET="$(copy_latest "$BOOTSTRAP_MAC_ARM64")"
BOOTSTRAP_MAC_X64_TARGET="$(copy_latest "$BOOTSTRAP_MAC_X64")"
AGENT_MAC_ARM64_TARGET="$(copy_latest "$AGENT_MAC_ARM64")"
AGENT_MAC_X64_TARGET="$(copy_latest "$AGENT_MAC_X64")"
BOOTSTRAP_WIN_X64_TARGET="$(copy_latest "$BOOTSTRAP_WIN_X64")"
AGENT_WIN_X64_TARGET="$(copy_latest "$AGENT_WIN_X64")"

cleanup_pattern 'Work Zilla Installer-mac-arm64-*.dmg' "$BOOTSTRAP_MAC_ARM64_TARGET"
cleanup_pattern 'Work Zilla Installer-mac-x64-*.dmg' "$BOOTSTRAP_MAC_X64_TARGET"
cleanup_pattern 'Work Zilla Agent-*-arm64.dmg' "$AGENT_MAC_ARM64_TARGET"
cleanup_pattern 'Work Zilla Agent-0.2.0.dmg' "$AGENT_MAC_X64_TARGET"
cleanup_pattern 'Work Zilla Installer-win-x64-*.exe' "$BOOTSTRAP_WIN_X64_TARGET"
cleanup_pattern 'Work Zilla Agent Setup *.exe' "$AGENT_WIN_X64_TARGET"

find "$DOWNLOADS_DIR" -maxdepth 1 -type f \( -name '*.part' -o -name '*.download' \) -delete

echo "Latest artifacts synced to $DOWNLOADS_DIR"
