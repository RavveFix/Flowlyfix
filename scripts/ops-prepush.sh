#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node scripts/ensure-canonical.mjs

npm run typecheck
npm run build

if [ "${PREPUSH_SMOKE:-1}" = "1" ]; then
  npm run ops:changed-smoke
else
  echo "PREPUSH_SMOKE=0, skipping changed smoke suites."
fi

