#!/bin/bash
set -e
APP_NAME="Work Zilla Agent.app"
APP_PATH="/Applications/$APP_NAME"
SUPPORT_PATH="$HOME/Library/Application Support/Work Zilla Agent"
PREFS_PATH="$HOME/Library/Preferences/com.workzilla.agent.plist"
CACHE_PATH="$HOME/Library/Caches/com.workzilla.agent"
LOG_PATH="$HOME/Library/Logs/Work Zilla Agent"

if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH"
fi

rm -rf "$SUPPORT_PATH" "$CACHE_PATH" "$LOG_PATH" "$PREFS_PATH"

echo "Work Zilla Agent removed."
