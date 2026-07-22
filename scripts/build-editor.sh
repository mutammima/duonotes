#!/usr/bin/env bash
#
# Builds the DuoNotes WebView editor (web-editor/) into a single self-contained
# HTML file, then inlines that HTML into src/lib/editor-html.js so Metro can
# import it as a string and hand it to tentap via `customSource`.
#
# Run this after ANY change under web-editor/ — the RN app ships the generated
# file, not the sources.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▶︎ Building editor web bundle…"
npx vite build --config web-editor/vite.config.ts

echo "▶︎ Inlining HTML into src/lib/editor-html.js…"
node node_modules/@10play/tentap-editor/scripts/buildEditor.js \
  web-editor/dist/index.html \
  src/lib/editor-html.js

echo "✅ Editor bundle built ($(wc -c < src/lib/editor-html.js | tr -d ' ') bytes)"
