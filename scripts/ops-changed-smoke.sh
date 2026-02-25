#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BASE_REF="${1:-}"
if [ -z "$BASE_REF" ]; then
  if git rev-parse --verify origin/main >/dev/null 2>&1; then
    BASE_REF="$(git merge-base origin/main HEAD)"
  else
    BASE_REF="HEAD~1"
  fi
fi

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "Invalid base ref for diff: $BASE_REF"
  exit 1
fi

mapfile -t changed_files < <(git diff --name-only "$BASE_REF"...HEAD)

if [ "${#changed_files[@]}" -eq 0 ]; then
  echo "No changed files since $BASE_REF. Skipping smoke suites."
  exit 0
fi

run_auth=0
run_admin=0

for file in "${changed_files[@]}"; do
  lower="$(printf '%s' "$file" | tr '[:upper:]' '[:lower:]')"

  case "$file" in
    supabase/migrations/*|supabase/functions/*)
      run_auth=1
      run_admin=1
      ;;
  esac

  case "$file" in
    src/features/auth/*|src/features/auth/*/*|src/features/auth/*/*/*|src/shared/lib/supabase/*|src/shared/lib/supabase/*/*|tests/e2e/auth-refresh-stability.spec.ts|tests/e2e/logout-login-stability.spec.ts|tests/e2e/host-normalization.spec.ts|tests/e2e/admin-nav-stability.spec.ts)
      run_auth=1
      ;;
  esac

  case "$file" in
    src/features/jobs/*|src/features/jobs/*/*|src/features/jobs/*/*/*|src/features/resources/*|src/features/resources/*/*|src/features/resources/*/*/*|src/features/settings/*|src/features/settings/*/*|src/features/settings/*/*/*|tests/e2e/flowly-admin-ops.smoke.spec.ts|tests/e2e/flowly-billing.smoke.spec.ts|tests/e2e/admin-user-management.smoke.spec.ts)
      run_admin=1
      ;;
  esac

  if [[ "$lower" == *"auth"* ]]; then
    run_auth=1
  fi

  if [[ "$lower" == *"billing"* ]] || [[ "$lower" == *"dispatch"* ]] || [[ "$lower" == *"workshop"* ]]; then
    run_admin=1
  fi
done

if [ "$run_auth" -eq 0 ] && [ "$run_admin" -eq 0 ]; then
  echo "No smoke-relevant changes detected. Skipping smoke suites."
  exit 0
fi

if [ "$run_auth" -eq 1 ]; then
  echo "Running smoke:auth based on changed files..."
  npm run smoke:auth
fi

if [ "$run_admin" -eq 1 ]; then
  echo "Running smoke:admin based on changed files..."
  npm run smoke:admin
fi
