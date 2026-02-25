#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-.env.local}"
DRY_RUN=0
REPO=""

usage() {
  cat <<'EOF'
Usage: scripts/sync-ci-secrets.sh [--repo owner/name] [--env-file path] [--dry-run]

Syncs required GitHub Actions secrets from local env/context into the repository.

Examples:
  scripts/sync-ci-secrets.sh
  scripts/sync-ci-secrets.sh --repo RavveFix/Flowlyfix
  scripts/sync-ci-secrets.sh --dry-run
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [ -z "$REPO" ]; then
  origin_url="$(git remote get-url origin 2>/dev/null || true)"
  if [ -n "$origin_url" ]; then
    REPO="$(printf '%s' "$origin_url" | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
  fi
fi

if [ -z "$REPO" ]; then
  REPO="RavveFix/Flowlyfix"
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required. Install GitHub CLI and retry."
  exit 1
fi

if ! gh auth status -h github.com >/dev/null 2>&1; then
  echo "gh is not authenticated for github.com. Run: gh auth login"
  exit 1
fi

read_env_value() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 1
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  [ -n "$line" ] || return 1
  local value
  value="${line#*=}"
  value="$(printf '%s' "$value" | sed -E 's/^\s+//; s/\s+$//')"

  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

read_key() {
  local key="$1"
  local val="${!key:-}"
  if [ -n "$val" ]; then
    printf '%s' "$val"
    return 0
  fi
  read_env_value "$key" || true
}

first_non_empty() {
  local val=""
  for candidate in "$@"; do
    if [ -n "$candidate" ]; then
      val="$candidate"
      break
    fi
  done
  printf '%s' "$val"
}

set_secret() {
  local name="$1"
  local value="$2"

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] Would set secret: $name"
    return 0
  fi

  printf '%s' "$value" | gh secret set "$name" -R "$REPO"
  echo "Set secret: $name"
}

missing_required=()
missing_optional=()

vite_url="$(read_key "VITE_SUPABASE_URL")"
vite_anon="$(read_key "VITE_SUPABASE_ANON_KEY")"
admin_email="$(first_non_empty "$(read_key "E2E_ADMIN_EMAIL")" "$(read_key "ADMIN_EMAIL")" "$(read_key "FLOWLY_ADMIN_EMAIL")")"
admin_password="$(first_non_empty "$(read_key "E2E_ADMIN_PASSWORD")" "$(read_key "ADMIN_PASSWORD")" "$(read_key "FLOWLY_ADMIN_PASSWORD")")"
supabase_token="$(read_key "SUPABASE_ACCESS_TOKEN")"
supabase_ref="$(read_key "SUPABASE_PROJECT_REF")"
supabase_db_url="$(read_key "SUPABASE_DB_URL")"
supabase_db_password="$(read_key "SUPABASE_DB_PASSWORD")"

if [ -z "$supabase_ref" ] && [ -f "supabase/.temp/project-ref" ]; then
  supabase_ref="$(cat supabase/.temp/project-ref | tr -d '[:space:]')"
fi

if [ -z "$supabase_db_url" ] && [ -f "supabase/.temp/pooler-url" ]; then
  supabase_db_url="$(cat supabase/.temp/pooler-url | tr -d '[:space:]')"
fi

# Required secrets
[ -n "$vite_url" ] && set_secret "VITE_SUPABASE_URL" "$vite_url" || missing_required+=("VITE_SUPABASE_URL")
[ -n "$vite_anon" ] && set_secret "VITE_SUPABASE_ANON_KEY" "$vite_anon" || missing_required+=("VITE_SUPABASE_ANON_KEY")
[ -n "$admin_email" ] && set_secret "E2E_ADMIN_EMAIL" "$admin_email" || missing_required+=("E2E_ADMIN_EMAIL")
[ -n "$admin_password" ] && set_secret "E2E_ADMIN_PASSWORD" "$admin_password" || missing_required+=("E2E_ADMIN_PASSWORD")
[ -n "$supabase_token" ] && set_secret "SUPABASE_ACCESS_TOKEN" "$supabase_token" || missing_required+=("SUPABASE_ACCESS_TOKEN")
[ -n "$supabase_ref" ] && set_secret "SUPABASE_PROJECT_REF" "$supabase_ref" || missing_required+=("SUPABASE_PROJECT_REF")
[ -n "$supabase_db_url" ] && set_secret "SUPABASE_DB_URL" "$supabase_db_url" || missing_required+=("SUPABASE_DB_URL")

# Optional but recommended
if [ -n "$supabase_db_password" ]; then
  set_secret "SUPABASE_DB_PASSWORD" "$supabase_db_password"
else
  missing_optional+=("SUPABASE_DB_PASSWORD")
fi

echo
if [ "${#missing_required[@]}" -gt 0 ]; then
  echo "Missing required values in local context (not set in GitHub):"
  for key in "${missing_required[@]}"; do
    echo "- $key"
  done
  echo
  echo "Set missing values and rerun:"
  echo "  gh secret set E2E_ADMIN_EMAIL -R $REPO"
  echo "  gh secret set E2E_ADMIN_PASSWORD -R $REPO"
  echo "  gh secret set SUPABASE_ACCESS_TOKEN -R $REPO"
  echo "  gh secret set SUPABASE_DB_URL -R $REPO"
  exit 2
fi

echo "All required CI secrets are synced to $REPO."
if [ "${#missing_optional[@]}" -gt 0 ]; then
  echo "Optional/recommended still missing: ${missing_optional[*]}"
fi
