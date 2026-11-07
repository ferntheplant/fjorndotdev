#!/bin/sh
# The command-line checks from step 7 of SKILL.md. What each check is, and why
# it exists, is in references/validation.md.
#
# Usage: sh validate-output.sh <drafted page> <short commit>
#
# Pass literal paths. A shell variable set in an earlier tool call is gone.
# Exits 0 when every pass/fail check passes, 1 when one fails, 2 on bad usage.

page=$1
sha=$2

if [ -z "$page" ] || [ -z "$sha" ]; then
  echo "usage: sh validate-output.sh <drafted page> <short commit>" >&2
  exit 2
fi
if ! printf '%s\n' "$sha" | grep -qE '^[0-9a-f]{4,40}$'; then
  echo "usage: <short commit> must be 4 to 40 lowercase hex characters" >&2
  exit 2
fi

# A directory passes test -s, and step 8's $out is a directory, so require a
# regular file as well.
if [ ! -f "$page" ] || [ ! -s "$page" ]; then
  echo "FAIL: $page is not a non-empty file" >&2
  exit 1
fi

status=0

# Flatten, then strip anchors, so a linked reference still counts as a reference.
refs=$(tr '\n' ' ' < "$page" | sed -E 's#</?a[^>]*>##g; s/  +/ /g' \
  | grep -oE '(<code[^>]*>|class="filename"[^>]*>) *[^<]*\.[A-Za-z]+:[0-9]+' | wc -l | tr -d ' ')
links=$(grep -o 'class="srcref"' "$page" | wc -l | tr -d ' ')
echo "references=$refs linked=$links"

# A link names the full 40-character sha. GitHub resolves an abbreviation only
# while the commit is on a branch, so a short sha 404s once a squash merge lands.
full="/blob/${sha}[0-9a-f]{$((40 - ${#sha}))}/"
wrong=$(grep -o 'href="[^"]*/blob/[^"]*"' "$page" | grep -vE "$full")
if [ -n "$wrong" ]; then
  echo "FAIL: links that do not name the full 40-character sha starting $sha:"
  echo "$wrong"
  status=1
else
  echo "pass: every blob link names the full sha of $sha"
fi

# GitHub renders Markdown, and the rendered view ignores a line anchor. Match
# every Markdown line link, whatever query it carries, then keep the bare ones.
md='href="[^"]*/blob/[^"]*\.(md|markdown)(\?[^"#]*)?#L[^"]*"'
bare=$(grep -oiE "$md" "$page" | grep -v 'plain=1')
if [ -n "$bare" ]; then
  echo "FAIL: Markdown links with a line anchor and no ?plain=1:"
  echo "$bare"
  status=1
else
  echo "pass: every Markdown line link carries ?plain=1"
fi

# The quiz is the last section in <main>, so read from its tag to </main>.
# A nested </section> cannot end it early, and id can sit anywhere in the tag.
quiz() {
  sed -n '/id="quiz"/,/<\/main>/p' "$page" \
    | tr '\n' ' ' | sed -E 's/<[^>]+>/ /g; s/  +/ /g'
}

quiz_text=$(quiz)
if [ -z "$(printf '%s' "$quiz_text" | tr -d ' ')" ]; then
  echo "FAIL: no quiz section found, so the quiz checks read nothing"
  status=1
fi

positional=$(printf '%s\n' "$quiz_text" | grep -oEi 'the (first|second|third|last) option|the (former|latter)\b')
if [ -n "$positional" ]; then
  echo "FAIL: quiz text names an option by position:"
  echo "$positional"
  status=1
else
  echo "pass: no quiz option named by position"
fi

echo "advisory: ordinals in the quiz, read each one:"
printf '%s\n' "$quiz_text" | grep -oEi 'the (first|second|third|last|former|latter)\b[^.]{0,40}' || echo "  none"

exit $status
