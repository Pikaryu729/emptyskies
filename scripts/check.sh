#!/usr/bin/env bash
# The one runnable check (spec 4.6). Exits non-zero on any failure.
#   1. every page's shell (head block + body minus <main>) matches index.html's
#   2. every slug in a markup hook exists in js/core.js
#   3. 404.html has no relative src/href (Pages serves it at any depth)
#   plus the page contract: one h1[tabindex=-1] per page, no <script>/<style> inside <main>
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
bad() { echo "FAIL: $*" >&2; fail=1; }

pages=(index.html emptyabovebelow/index.html links/index.html 404.html music/*/index.html)

# shell:head block, then <body>…</body> with <main>…</main> cut, normalised
shell() {
  { sed -n '/<!-- shell:head -->/,/<!-- \/shell:head -->/p' "$1"
    sed -n '/<body>/,/<\/body>/p' "$1" | sed '/<main[ >]/,/<\/main>/c\<main/>'
  } | sed -E 's#(\.\./)+##g; s#(href|src)="\./#\1="#g; s/ aria-current="[^"]*"//g' |
    if [ "$1" = 404.html ]; then sed -E 's#(href|src)="/#\1="#g'; else cat; fi
}
ref=$(shell index.html)
[ "$(grep -c '<main/>' <<<"$ref")" = 1 ] || bad "index.html: shell markers or <main> missing"
for p in "${pages[@]}"; do
  [ -f "$p" ] || { bad "$p missing"; continue; }
  d=$(diff <(echo "$ref") <(shell "$p")) || bad "$p: shell differs from index.html"$'\n'"$d"
  m=$(sed -n '/<main[ >]/,/<\/main>/p' "$p")
  [ "$(grep -o '<h1[^>]*tabindex="-1"' <<<"$m" | wc -l)" = 1 ] && [ "$(grep -o '<h1[ >]' <<<"$m" | wc -l)" = 1 ] ||
    bad "$p: needs exactly one h1, with tabindex=-1"
  grep -qE '<(script|style)[ >]' <<<"$m" && bad "$p: <script>/<style> inside <main> (fetched pages never run them)"
  # track rows: the button's name comes from its text ("05 play Title", label in name), and the number
  # sits outside the button so it survives no-JS, where play buttons are hidden
  grep -qE '<button class="idx[^>]*aria-label|<span class="n">' <<<"$m" &&
    bad "$p: row play button has an aria-label, or its number is inside the button"
done

for s in $(cat "${pages[@]}" | grep -oE 'data-(play|track|wave|progress|weight)="[^"]*"' | cut -d'"' -f2 | sort -u); do
  grep -q "slug: '$s'" js/core.js || bad "unknown slug '$s' (not in js/core.js)"
done

rel=$(grep -oE '(src|href)="[^"]*"' 404.html | cut -d'"' -f2 | grep -vE '^(/|#|https?:|mailto:)')
[ -z "$rel" ] || bad "404.html has relative paths: $(echo $rel)"

[ $fail = 0 ] && echo "check: ok (${#pages[@]} pages)"
exit $fail
