#!/usr/bin/env bash
# Capture desktop + mobile screenshots of $CAPTURE_URL into $CAPTURE_DIR.
#
# Contract:
#   CAPTURE_URL / CAPTURE_DIR come from the environment.
#   Opens the exact URL in its own browser session, waits for rendered app
#   content, saves final-desktop.png + final-mobile.png in CAPTURE_DIR
#   (outside the source tree), closes its own browser, leaves the app running.
# Exit codes:
#   0  both screenshots captured and non-trivial.
#   75 temporary navigation / browser infrastructure failure.
#   1  script misuse or rendering defect (page reachable but app not rendered,
#      screenshots missing/empty).
set -euo pipefail
cd "$(dirname "$0")"

if [[ -z "${CAPTURE_URL:-}" ]]; then echo "CAPTURE_URL is required" >&2; exit 1; fi
if [[ -z "${CAPTURE_DIR:-}" ]]; then echo "CAPTURE_DIR is required" >&2; exit 1; fi
SESS="focuscap-$$"
DESKTOP="$CAPTURE_DIR/final-desktop.png"
MOBILE="$CAPTURE_DIR/final-mobile.png"

close_browser() { /usr/bin/time -p playwright-cli -s="$SESS" close >/dev/null 2>&1 || true; }
fail_temp() { echo "capture infra failure: $*" >&2; close_browser; exit 75; }
fail_defect() { echo "capture defect: $*" >&2; close_browser; exit 1; }

echo "== capture (url=$CAPTURE_URL, dir=$CAPTURE_DIR) =="
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

# 0. The URL must be reachable; otherwise this is infra, not a rendering bug.
if ! /usr/bin/time -p curl --fail --silent --show-error --location --max-time 20 --output /dev/null "$CAPTURE_URL"; then
  fail_temp "CAPTURE_URL not reachable via curl"
fi

# 1. Open the exact URL in our own browser session.
if ! /usr/bin/time -p playwright-cli -s="$SESS" open "$CAPTURE_URL" >/dev/null 2>&1; then
  fail_temp "browser failed to open $CAPTURE_URL"
fi

# 2. Wait for rendered app content (React root populated + brand text).
rendered=0
for ((i = 1; i <= 30; i++)); do
  text="$(/usr/bin/time -p playwright-cli -s="$SESS" eval "() => (document.getElementById('root') ? document.getElementById('root').innerText.length : -1) + ' :: ' + document.title" 2>/dev/null)" \
    || fail_temp "browser eval failed while waiting for render (attempt $i)"
  echo "render poll $i: $text"
  len="${text%% :: *}"; len="${len//[^0-9]/}"
  if [[ -n "$len" && "$len" -gt 200 ]]; then rendered=1; break; fi
  /usr/bin/time -p sleep 2
done
[[ "$rendered" == 1 ]] || fail_defect "app did not render within 60s (root text too short)"
body="$(playwright-cli -s="$SESS" eval "() => document.body.innerText.slice(0,2000)" 2>/dev/null)" \
  || fail_temp "browser eval failed on final content check"
case "$body" in
  *Focus30*) echo "brand marker found in rendered content" ;;
  *) fail_defect "rendered page lacks Focus30 content" ;;
esac

# 3. Desktop view.
if ! /usr/bin/time -p playwright-cli -s="$SESS" resize 1440 900 >/dev/null 2>&1; then
  fail_temp "desktop resize failed"
fi
/usr/bin/time -p sleep 2
if ! /usr/bin/time -p playwright-cli -s="$SESS" screenshot --filename="$DESKTOP" >/dev/null 2>&1; then
  fail_temp "desktop screenshot command failed"
fi
[[ -f "$DESKTOP" ]] || fail_defect "final-desktop.png not created"
/usr/bin/time -p test "$(stat -c%s "$DESKTOP")" -gt 10240 || fail_defect "final-desktop.png too small (blank?)"

/usr/bin/time -p ls -la "$DESKTOP"

# 4. Mobile view (fresh layout pass after resize).
if ! /usr/bin/time -p playwright-cli -s="$SESS" resize 390 844 >/dev/null 2>&1; then
  fail_temp "mobile resize failed"
fi
if ! /usr/bin/time -p playwright-cli -s="$SESS" reload >/dev/null 2>&1; then
  fail_temp "mobile reload failed"
fi
/usr/bin/time -p sleep 3
if ! /usr/bin/time -p playwright-cli -s="$SESS" screenshot --filename="$MOBILE" >/dev/null 2>&1; then
  fail_temp "mobile screenshot command failed"
fi
[[ -f "$MOBILE" ]] || fail_defect "final-mobile.png not created"
/usr/bin/time -p test "$(stat -c%s "$MOBILE")" -gt 10240 || fail_defect "final-mobile.png too small (blank?)"

/usr/bin/time -p ls -la "$MOBILE"

# 5. Close only our own browser; the app keeps running.
close_browser
echo "capture OK: $DESKTOP $MOBILE"
exit 0
