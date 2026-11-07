#!/usr/bin/env bash
# find-base.sh: find the upstream commit a local copy was taken from, when nothing recorded it.
#
#   find-base.sh <ref> <source-path> <local-path> [<exclude-pathspec>...]
#
# Run from the repo holding the copy, after fetching the upstream history into it (SKILL.md,
# _Fetch_). Ranks every commit on <ref> that touched <source-path> by how many files under
# <local-path> are byte-identical to that commit's file at the same relative path, then
# re-ranks the ten best by distance: the lines changed between that commit and the local copy,
# counting a local file the commit lacks as all added. Matches alone favour the newest commit
# whenever upstream changed only files the copy also edited; distance picks the state the copy
# was actually taken from. Prints the best three, newest first among equals:
#
#   <sha> <date> <matches>/<local files> <distance> <subject>
#
# "." stands for the root on either side. Excludes are pathspecs on the local side, such as
# ':(exclude)README.md'. A low score means the copy was edited heavily, not that the answer is
# wrong: the top line is still the closest upstream state to diff against.

set -euo pipefail

if [[ $# -lt 3 ]]; then
  sed -n '2,18p' "$0" >&2
  exit 2
fi

ref=$1
src=${2%/}
dst=${3%/}
shift 3

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Local files as "<blob>\t<path relative to local-path>".
# Regular files only: a symlink's blob is its target path, which hash-object cannot reproduce.
git ls-files -co --exclude-standard -- "$dst" "$@" |
  while IFS= read -r path; do [[ -f $path && ! -L $path ]] && printf '%s\n' "$path"; done >"$work/paths" || true
if [[ ! -s $work/paths ]]; then
  echo "find-base: no files under $dst" >&2
  exit 1
fi
git hash-object --stdin-paths <"$work/paths" >"$work/blobs"
if [[ $dst == "." ]]; then
  paste "$work/blobs" "$work/paths" >"$work/local"
else
  paste "$work/blobs" "$work/paths" | sed "s|	$dst/|	|" >"$work/local"
fi
total=$(wc -l <"$work/paths" | tr -d ' ')

if [[ $src == "." ]]; then
  commits=$(git rev-list "$ref")
else
  commits=$(git rev-list "$ref" -- "$src")
fi

# Writes "<blob>\t<relative path>" for every file under <source-path> at a commit.
upstream_files() {
  if [[ $src == "." ]]; then
    git ls-tree -r "$1" | awk -F'\t' '{ split($1, m, " "); print m[3] "\t" $2 }'
  else
    git ls-tree -r "$1" -- "$src/" |
      awk -F'\t' -v p="$src/" '{ split($1, m, " "); print m[3] "\t" substr($2, length(p) + 1) }'
  fi
}

for commit in $commits; do
  upstream_files "$commit" >"$work/upstream"
  printf '%s %s\n' "$(grep -cxFf "$work/upstream" "$work/local" || true)" "$commit"
done | sort -s -k1,1nr | head -10 >"$work/ranked"

while read -r matches commit; do
  upstream_files "$commit" >"$work/upstream"
  distance=0
  while IFS=$'\t' read -r blob path; do
    theirs=$(awk -F'\t' -v p="$path" '$2 == p { print $1; exit }' "$work/upstream")
    [[ $theirs == "$blob" ]] && continue
    if [[ -z $theirs ]]; then
      : >"$work/theirs"
    else
      git cat-file blob "$theirs" >"$work/theirs"
    fi
    ours=$path
    [[ $dst == "." ]] || ours=$dst/$path
    lines=$({ git diff --no-index --numstat "$work/theirs" "$ours" || true; } | awk '{ n += $1 + $2 } END { print n + 0 }')
    distance=$((distance + lines))
  done <"$work/local"
  printf '%s %s %s %s/%s %s %s\n' "$distance" "$matches" \
    "$(git log -1 --format='%h %ad' --date=short "$commit")" "$matches" "$total" "$distance" \
    "$(git log -1 --format='%s' "$commit")"
done <"$work/ranked" | sort -s -k1,1n -k2,2nr | head -3 | cut -d' ' -f3-
