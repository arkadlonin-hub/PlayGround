#!/usr/bin/env bash
# My AI Builder — startup script.
# Installs dependencies, builds the static output inside the project,
# publishes worker metadata, then serves the full app in the foreground.
set -euo pipefail

PROJECT_DIR="$(dirname "$0")"
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
cd "$PROJECT_DIR"

: "${PORT:=3000}"
export PORT

# Install dependencies when they are missing or the manifest is newer.
/usr/bin/time -p bash -c '
  set -euo pipefail
  if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
    if [ -f package-lock.json ]; then npm ci --no-audit --no-fund
    else npm install --no-audit --no-fund; fi
  else echo "dependencies up to date; skipping install"; fi
'

# Build: sync the static frontend into dist/ (built output stays in PROJECT_DIR).
/usr/bin/time -p rm -rf dist
/usr/bin/time -p mkdir -p dist
/usr/bin/time -p cp -r public/. dist/
/usr/bin/time -p test -f dist/index.html

# Worker metadata only: report the absolute built static directory.
/usr/bin/time -p /usr/bin/printf '{"project":"%s","directory":"%s"}' \
  "$PROJECT_DIR" "$PROJECT_DIR/dist" > "${OPENCODE_WEB_DIR:?}/deployment-output.json"
/usr/bin/time -p cat "${OPENCODE_WEB_DIR:?}/deployment-output.json"
/usr/bin/time -p echo

/usr/bin/time -p node --check server.js

# Serve the full app (API + static + live preview) in the foreground.
exec node server.js
