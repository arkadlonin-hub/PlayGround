#!/usr/bin/env bash
# My AI Builder — capture script.
# Opens CAPTURE_URL exactly, waits for rendered content, saves
# final-desktop.png (1440x900) and final-mobile.png (390x844) into CAPTURE_DIR.
# Exit codes: 75 = temporary navigation/browser infrastructure failure,
#              1 = script usage or rendering defect.
# Capture output stays in CAPTURE_DIR (outside the project); the app keeps running.
set -euo pipefail

fail_temp() { echo "capture: transient infrastructure failure: $*" >&2; exit 75; }
fail_perm() { echo "capture: defect: $*" >&2; exit 1; }

[ -n "${CAPTURE_URL:-}" ] || fail_perm "CAPTURE_URL is not set."
[ -n "${CAPTURE_DIR:-}" ] || fail_perm "CAPTURE_DIR is not set."
/usr/bin/time -p mkdir -p "$CAPTURE_DIR" || fail_perm "cannot create CAPTURE_DIR=$CAPTURE_DIR."

SESS="myai-capture-$$"
close_browser() {
  playwright-cli -s="$SESS" close >/dev/null 2>&1 || true
}
trap close_browser EXIT

# 1. Open the exact URL in our own browser (navigation/infra faults -> 75).
/usr/bin/time -p playwright-cli -s="$SESS" open "$CAPTURE_URL" >/dev/null \
  || fail_temp "cannot open browser at $CAPTURE_URL."

# 2. Wait for rendered content: readyState complete + the app title present.
render_state() {
  playwright-cli -s="$SESS" --raw eval \
    "() => document.readyState + '|' + document.title + '|' + ((document.body && document.body.innerText) ? document.body.innerText.replace(/\\s+/g, ' ').trim().length : 0)" 2>/dev/null
}
ready=false
for _ in $(/usr/bin/time -p seq 1 30); do
  raw="$(render_state)" || fail_temp "browser session lost while waiting for render."
  raw="${raw#\"}"; raw="${raw%\"}"
  state="${raw%%|*}"; rest="${raw#*|}"
  title="${rest%%|*}"; chars="${rest##*|}"
  if [ "$state" = "complete" ] && [ "${chars:-0}" -ge 20 ]; then ready=true; break; fi
  /usr/bin/time -p sleep 1
done
[ "$ready" = true ] || fail_temp "page did not finish rendering within 30s."
case "$title" in
  *My\ AI*) ;;
  *) fail_perm "unexpected content rendered (title: $title)."
esac

# 3. Desktop view 1440x900.
/usr/bin/time -p playwright-cli -s="$SESS" resize 1440 900 >/dev/null \
  || fail_temp "cannot set desktop viewport."
/usr/bin/time -p sleep 2
/usr/bin/time -p playwright-cli -s="$SESS" screenshot --filename "$CAPTURE_DIR/final-desktop.png" >/dev/null \
  || fail_temp "desktop screenshot failed."
/usr/bin/time -p test -s "$CAPTURE_DIR/final-desktop.png" \
  || fail_perm "final-desktop.png is missing or empty."

# 4. Mobile view 390x844 in the same session (viewport reflow).
/usr/bin/time -p playwright-cli -s="$SESS" resize 390 844 >/dev/null \
  || fail_temp "cannot set mobile viewport."
/usr/bin/time -p sleep 2
/usr/bin/time -p playwright-cli -s="$SESS" screenshot --filename "$CAPTURE_DIR/final-mobile.png" >/dev/null \
  || fail_temp "mobile screenshot failed."
/usr/bin/time -p test -s "$CAPTURE_DIR/final-mobile.png" \
  || fail_perm "final-mobile.png is missing or empty."

/usr/bin/time -p ls -la "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"
echo "capture: done."
