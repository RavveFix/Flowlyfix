# Release Runbook

## CI/CD flow
- PRs to `main` must pass `label-policy`, `typecheck`, `build`, `smoke-auth`, `smoke-admin`.
- Vercel handles preview deploys per PR and production deploy on merge to `main`.
- Supabase deploy workflow runs automatically on `main` pushes that touch:
  - `supabase/migrations/**`
  - `supabase/functions/**`

## Required GitHub Secrets
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD` (recommended)
- `SUPABASE_DB_URL` (read-only verification connection)

## Agent lanes (max 3 parallel)
- Branch naming: `agent/{ticket-id}-{short-name}`
- One lane label per PR: `agent-track-1` or `agent-track-2` or `agent-track-3`
- Add `db-change` if DB migration/function files changed.
- Add `risk-high` if auth/RLS/policy/permission-sensitive surfaces changed.

## Local developer gates
- Full local smoke: `npm run ops:smoke`
- Pre-push gate: `npm run ops:prepush`
- Auto-detect smoke scope: `npm run ops:changed-smoke`

## Rollback
1. Identify last known-good commit on `main`.
2. Revert the failing commit(s): `git revert <sha>` and open an emergency PR.
3. If database changes are involved:
- Create a forward-fix migration (preferred) that restores expected schema/constraints.
- For urgent incidents, execute a reviewed manual SQL hotfix and immediately capture it as migration.
4. Verify rollback/fix:
- CI checks green on PR.
- Supabase post-deploy verification passes.
- Vercel production deployment responds and core smoke paths work.

## Branch protection setup
- Run `scripts/setup-branch-protection.sh` (requires admin rights on repository).
