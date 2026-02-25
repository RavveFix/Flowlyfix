#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node scripts/ensure-canonical.mjs

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required for ops:smoke. Install it and retry."
  exit 1
fi

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example. Fill in required values before re-running if needed."
fi

echo "Starting local Supabase (Docker)..."
supabase start

echo "Running typecheck + build..."
npm run typecheck
npm run build

echo "Starting preview server on http://localhost:3000 ..."
npx vite preview --host 0.0.0.0 --port 3000 --strictPort >/tmp/flowly-preview.log 2>&1 &
PREVIEW_PID=$!

cleanup() {
  if kill -0 "$PREVIEW_PID" >/dev/null 2>&1; then
    kill "$PREVIEW_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for i in $(seq 1 30); do
  if curl -sf http://localhost:3000 >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -sf http://localhost:3000 >/dev/null; then
  echo "Preview server did not become ready."
  cat /tmp/flowly-preview.log || true
  exit 1
fi

echo "Running smoke suites..."
npm run smoke:auth
npm run smoke:admin

echo "ops:smoke completed successfully."
