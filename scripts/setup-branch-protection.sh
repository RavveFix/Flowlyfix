#!/usr/bin/env bash
set -euo pipefail

OWNER_REPO="${1:-RavveFix/Flowlyfix}"
shift || true

if [ "$#" -eq 0 ]; then
  TARGET_BRANCHES=("staging" "main")
else
  TARGET_BRANCHES=("$@")
fi

# Ensure required labels exist.
gh label create "agent-track-1" --repo "$OWNER_REPO" --color "1f6feb" --description "Agent lane 1 (required: one agent-track label per PR)." --force >/dev/null
echo "Ensured label: agent-track-1"
gh label create "agent-track-2" --repo "$OWNER_REPO" --color "0e8a16" --description "Agent lane 2 (required: one agent-track label per PR)." --force >/dev/null
echo "Ensured label: agent-track-2"
gh label create "agent-track-3" --repo "$OWNER_REPO" --color "fbca04" --description "Agent lane 3 (required: one agent-track label per PR)." --force >/dev/null
echo "Ensured label: agent-track-3"
gh label create "db-change" --repo "$OWNER_REPO" --color "d93f0b" --description "PR changes Supabase migrations or edge functions." --force >/dev/null
echo "Ensured label: db-change"
gh label create "risk-high" --repo "$OWNER_REPO" --color "b60205" --description "PR touches high-risk auth/RLS/policy/permission surfaces." --force >/dev/null
echo "Ensured label: risk-high"

# Build shared branch protection payload.
tmp_payload="$(mktemp)"
cat > "$tmp_payload" <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["label-policy", "typecheck", "build", "smoke-auth", "smoke-admin"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": true
}
JSON

for TARGET_BRANCH in "${TARGET_BRANCHES[@]}"; do
  gh api --method PUT \
    -H "Accept: application/vnd.github+json" \
    "repos/$OWNER_REPO/branches/$TARGET_BRANCH/protection" \
    --input "$tmp_payload" >/dev/null
  echo "Branch protection updated for $OWNER_REPO $TARGET_BRANCH."
done

rm -f "$tmp_payload"
