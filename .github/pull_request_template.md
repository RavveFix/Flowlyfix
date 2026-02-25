## Scope
- Ticket/Issue:
- Summary of change:

## Test Evidence
- [ ] CI: `typecheck`
- [ ] CI: `build`
- [ ] CI: `smoke-auth`
- [ ] CI: `smoke-admin`
- [ ] Local: `npm run ops:smoke` (or explain why skipped)

## DB Impact
- [ ] No DB change
- [ ] `db-change` label added (required if `supabase/migrations/**` or `supabase/functions/**` changed)
- Notes on migration/function impact:

## Risk / Security
- [ ] `risk-high` label added (required for auth/RLS/policy-sensitive changes)
- Notes on auth/permissions/RLS impact:

## Rollback Plan
- Revert strategy (commit(s) / migration rollback path / feature flag):
- Validation after rollback:
