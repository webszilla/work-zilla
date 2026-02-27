#!/usr/bin/env bash
set -euo pipefail

MAX_BYTES=$((95 * 1024 * 1024))

get_size_bytes() {
  local file_path="$1"
  if stat -f%z "$file_path" >/dev/null 2>&1; then
    stat -f%z "$file_path"
    return
  fi
  stat -c%s "$file_path"
}

format_mb() {
  awk -v bytes="$1" 'BEGIN { printf "%.2f MB", bytes / (1024 * 1024) }'
}

violations=0

while IFS= read -r -d '' file_path; do
  lower_path="$(printf '%s' "$file_path" | tr '[:upper:]' '[:lower:]')"
  case "$lower_path" in
    *.exe|*.msi|*.dmg|*.pkg|*.zip)
      if [[ -f "$file_path" ]]; then
        size_bytes="$(get_size_bytes "$file_path")"
        if (( size_bytes > MAX_BYTES )); then
          violations=$((violations + 1))
          echo "Oversize binary: $file_path ($(format_mb "$size_bytes"))"
        fi
      fi
      ;;
  esac
done < <(git ls-files -z)

if (( violations > 0 )); then
  echo "GitHub file-size guard failed. Keep each binary <= 95MB."
  exit 1
fi

echo "GitHub file-size guard passed."
