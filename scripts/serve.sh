#!/usr/bin/env bash
# scripts/serve.sh — launch the canary cockpit (G28, PLAN §10).
#
# The cockpit is a zero-dependency Node stdlib server (web/server.mjs) + a vanilla-JS SPA
# (web/index.html + web/app.js + web/styles.css). No build step. The cockpit is READ-MOSTLY
# (PLAN Q6) — it shells to the read-only `canary brain`/`canary explain`/`canary check-delivery`
# CLI and reads brain/*.md + logs/runs.jsonl; it never instruments/audits/pages from the browser.
#
# Usage: bash scripts/serve.sh            # serves on http://127.0.0.1:7799
#        CANARY_WEB_PORT=8080 bash scripts/serve.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${CANARY_WEB_PORT:-7799}"

# The data views shell to the built CLI; warn (don't fail) if dist/ is absent — the server boots
# and the affected endpoints return an honest 502 telling the chairman to build.
if [ ! -f "$REPO/dist/cli/index.js" ]; then
  echo "canary: dist/ not built — the brain/run/delivery views need it. Run: pnpm build" >&2
fi

echo "canary cockpit → http://127.0.0.1:${PORT}  (Ctrl-C to stop)"
exec node "$REPO/web/server.mjs"
