#!/usr/bin/env bash
# Focus30 AI — install deps, build when needed, publish deployment metadata,
# then serve the built static bundle in the FOREGROUND.
#
# Layout contract:
#   source + built output live inside PROJECT_DIR (this directory):
#     app source  -> <PROJECT_DIR>/focus30-ai
#     served dir  -> <PROJECT_DIR>/dist
#   OPENCODE_WEB_DIR / RUNNER_TEMP are used ONLY for worker metadata
#   (deployment-output.json, logs) — never for source or build output.
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$PWD"
APP_SRC="$PROJECT_DIR/focus30-ai"
DIST_DIR="$PROJECT_DIR/dist"
PORT="${PORT:-3000}"
[[ "$PORT" =~ ^[0-9]+$ ]] || { echo "PORT must be numeric, got: $PORT" >&2; exit 1; }
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DEPLOY_OUT="$WEB_DIR/deployment-output.json"

echo "== Focus30 AI startup (project=$PROJECT_DIR, port=$PORT) =="

# 1. Dependencies (once; reuse when present).
if [[ ! -d "$APP_SRC/node_modules" ]]; then
  echo "-- installing dependencies --"
  if [[ -f "$APP_SRC/package-lock.json" ]]; then
    /usr/bin/time -p npm ci --prefix "$APP_SRC"
  else
    /usr/bin/time -p npm install --prefix "$APP_SRC"
  fi
else
  echo "-- node_modules present, skipping install --"
fi

# 2. Build only when the bundle is missing or sources are newer.
need_build=0
if [[ ! -f "$DIST_DIR/index.html" ]]; then
  need_build=1
elif [[ -n "$(/usr/bin/time -p find "$APP_SRC/src" "$APP_SRC/index.html" "$APP_SRC/package.json" "$APP_SRC/vite.config.ts" -newer "$DIST_DIR/index.html" -print -quit 2>/dev/null)" ]]; then
  need_build=1
fi
if [[ "$need_build" == 1 ]]; then
  echo "-- building (bundle missing or stale) --"
  /usr/bin/time -p npm --prefix "$APP_SRC" run build
else
  echo "-- build output fresh, skipping build --"
fi
/usr/bin/time -p test -f "$APP_SRC/dist/index.html"

# 3. Sync the bundle to <PROJECT_DIR>/dist (drop stale hashed assets).
echo "-- syncing bundle to $DIST_DIR --"
/usr/bin/time -p rm -rf "$DIST_DIR"
/usr/bin/time -p mkdir -p "$DIST_DIR"
/usr/bin/time -p cp -r "$APP_SRC/dist/." "$DIST_DIR/"
/usr/bin/time -p test -f "$DIST_DIR/index.html"

# 4. Deployment record for the controller (metadata dir only).
echo "-- writing $DEPLOY_OUT --"
/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p printf '%s' "{\"project\":\"$PROJECT_DIR\",\"directory\":\"$DIST_DIR\"}" > "$DEPLOY_OUT"
/usr/bin/time -p python3 -c "import json; d=json.load(open('$DEPLOY_OUT')); assert d=={'project':'$PROJECT_DIR','directory':'$DIST_DIR'}, d; print('deployment-output.json OK:', d)"

# 5. Serve in the foreground (launcher owns this process via tmux).
echo "-- serving $DIST_DIR on 127.0.0.1:$PORT (foreground) --"
/usr/bin/time -p python3 -u -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIST_DIR"
