#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:-/tmp/autoreply-server-release.tgz}"
file_list="$(mktemp)"
archive_list="$(mktemp)"

cleanup() {
  rm -f "$file_list" "$archive_list"
}
trap cleanup EXIT

cd "$repo_root"

# Prune only the root React Native application. A broad "mobile" tar exclude
# also removes app/api/mobile, which breaks every native authentication route.
find . \
  \( \
    -path './.git' -o \
    -path './node_modules' -o \
    -path './.next' -o \
    -path './mobile' -o \
    -path './coverage' -o \
    -path './backups' \
  \) -prune -o \
  \( \
    -path './.env' -o \
    -path './.env.local.bak' -o \
    -name '*.tsbuildinfo' \
  \) -prune -o \
  -type f -print > "$file_list"

COPYFILE_DISABLE=1 tar -czf "$output" -T "$file_list"
tar -tzf "$output" > "$archive_list"

grep -q '^\./app/api/mobile/' "$archive_list"
if grep -q '^\./mobile/' "$archive_list"; then
  echo "error: root mobile application leaked into the server release" >&2
  exit 1
fi

echo "$output"
