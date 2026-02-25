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

## Branch strategy
- Source of truth: `README.md` section **Branch Strategy (main + staging)**.
- Default target branch for feature work is `main`.
- `staging` is reserved for release-batch validation before a single promotion PR to `main`.
- Labels are conditional only:
  - `db-change` if DB migration/function files changed.
  - `risk-high` if auth/RLS/policy/permission-sensitive surfaces changed.

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
