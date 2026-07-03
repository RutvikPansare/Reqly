#!/bin/bash
# Stages the Reqly server into packages/desktop/resources/server so
# electron-builder can ship it inside the desktop app (T-233).
#
# Layout produced:
#   packages/desktop/resources/server/dist/           <- root dist/ (server + ui build)
#   packages/desktop/resources/server/node_modules/   <- production deps only
#   packages/desktop/resources/server/package.json    <- workspaces field stripped
#
# The bin/ shims (packages/desktop/resources/bin/) are static files in git and
# are not touched here.
#
# Usage: scripts/build-desktop-resources.sh [--skip-build]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$ROOT/packages/desktop/resources/server"
ELECTRON_VERSION="$(node -e "console.log(require('$ROOT/node_modules/electron/package.json').version)")"

if [ "${1:-}" != "--skip-build" ]; then
  echo "==> Building server + UI"
  (cd "$ROOT" && npm run build)
fi

echo "==> Staging into $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$ROOT/dist" "$STAGE/dist"
cp "$ROOT/package-lock.json" "$STAGE/package-lock.json"

# Strip workspaces/devDependencies so npm ci in the staging dir does not try to
# resolve workspace packages that are not copied along.
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('$ROOT/package.json', 'utf8'));
  delete p.workspaces;
  delete p.devDependencies;
  delete p.scripts;
  fs.writeFileSync('$STAGE/package.json', JSON.stringify(p, null, 2));
"

echo "==> Installing production deps (native modules target Electron $ELECTRON_VERSION)"
(
  cd "$STAGE"
  # node-pty is a native module: compile it against Electron's ABI, not the
  # system Node ABI, or it fails to load under ELECTRON_RUN_AS_NODE.
  export npm_config_runtime=electron
  export npm_config_target="$ELECTRON_VERSION"
  export npm_config_disturl=https://electronjs.org/headers
  npm ci --omit=dev --ignore-scripts=false --no-audit --no-fund
)

echo "==> Smoke test: bundled server under Electron-as-Node"
ELECTRON_BIN="$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
if [ ! -x "$ELECTRON_BIN" ]; then
  ELECTRON_BIN="$ROOT/node_modules/electron/dist/electron"
fi
if [ -x "$ELECTRON_BIN" ]; then
  ELECTRON_RUN_AS_NODE=1 "$ELECTRON_BIN" "$STAGE/dist/server/index.js" status >/dev/null
  echo "    OK"
else
  echo "    Electron binary not found locally - skipped (CI will run it)"
fi

echo "==> Done. Now run: cd packages/desktop && npm run dist"
