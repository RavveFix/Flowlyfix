# Flowlyfix v1 (Web + Mobile + Supabase)

Flowlyfix is a field-service system for service companies (first case: coffee machine service teams).

## Single Source Of Truth

- Canonical repo root: this `Flowly` folder.
- Canonical dev origin: `http://localhost:3000`.
- Do not run app flows on `127.0.0.1:3000` in parallel with `localhost:3000`.

A startup guard (`scripts/ensure-canonical.mjs`) checks for `.flowly-canonical` and fails fast if commands are run from the wrong project root.

## Stack

- React + Vite + TypeScript
- Supabase (Auth, Postgres, RLS, Realtime, Edge Functions)
- Capacitor (mobile packaging for iOS/Android)

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_DEMO_MODE=false
VITE_APP_INSTANCE_ID=flowly-main
VITE_CANONICAL_DEV_ORIGIN=http://localhost:3000
VITE_AUTH_DEBUG=false # dev-only sidebar diagnostics
GEMINI_API_KEY=... # optional
```

3. Run dev server:

```bash
npm run dev
```

4. Run checks:

```bash
npm run typecheck
npm run build
```

## E2E smoke setup

Playwright defaults to `PLAYWRIGHT_BASE_URL=http://localhost:3000`.

For real-auth smoke tests, set:

```bash
E2E_ADMIN_EMAIL=...
E2E_ADMIN_PASSWORD=...
E2E_CALLBACK_ADMIN_EMAIL=... # dedicated callback test account
E2E_CALLBACK_ADMIN_PASSWORD=...
E2E_STRICT_AUTH_SMOKE=0
E2E_STRICT_ADMIN_SMOKE=0
```

## Automation and CI/CD

- PR gates run in GitHub Actions (`.github/workflows/ci-pr.yml`):
  - `label-policy`
  - `typecheck`
  - `build`
  - `smoke-auth`
  - `smoke-admin`
- Vercel handles branch preview deploys and production deploys from `main`.
- Extra preview validation runs in `.github/workflows/vercel-preview-guard.yml`.
- Supabase deploy on `main` runs via `.github/workflows/deploy-supabase-main.yml` for changes in `supabase/migrations/**` and `supabase/functions/**`.

Required CI secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `E2E_CALLBACK_ADMIN_EMAIL`
- `E2E_CALLBACK_ADMIN_PASSWORD`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD` (recommended)
- `SUPABASE_DB_URL`

## Branch Strategy (main + staging)

- Long-lived branches:
  - `main` (default branch and primary integration target)
  - `staging` (release-batch branch only)
- Daily work:
  - Create short-lived feature branches from `main`.
  - Open PRs to `main` by default.
- Release-batch exception:
  - Use `staging` only when multiple PRs must be validated together before a single promotion to `main`.
- Conditional labels:
  - `db-change` when `supabase/migrations/**` or `supabase/functions/**` are touched.
  - `risk-high` when auth/RLS/policy/permission-sensitive code is touched.

PR template: `.github/pull_request_template.md`

## Local Ops Commands

- Full smoke flow (Supabase + build + Playwright):

```bash
npm run ops:smoke
```

- Pre-push local gate:

```bash
npm run ops:prepush
```

- Changed-files smoke selection:

```bash
npm run ops:changed-smoke
```

## Agent Check-in Loop

Start each work session with:

```bash
npm run agent:checkin
```

Process:

- Run `npm run agent:checkin` at the start of each session.
- Present the generated output as a short status plus 2-4 prioritized questions.
- After finishing implementation work, update `docs/agent-memory.md` with latest status, risks, decisions, and next-pass questions.

## Branch Protection

Apply recommended protection and labels (repo admin required):

```bash
scripts/setup-branch-protection.sh
```

This config keeps `main` strict (required checks) and `staging` lightweight (review + conversation resolution, no required checks).
See `docs/release-runbook.md` for release and rollback procedures.

## Supabase schema

- Source of truth: `supabase/migrations/*`
- Do not edit schema outside migrations.

Apply via Supabase CLI migration flow.

## Project structure

- App shell and routing: `src/app/*`
- Feature modules: `src/features/*`
- Shared UI/types/lib/i18n: `src/shared/*`
- Sandbox mocks/prototypes: `src/sandbox/*`
- End-to-end smoke tests: `tests/e2e/*`

## Edge Functions

Implemented:

- `bootstrap-admin-profile`
- `self-signup-organization`
- `switch-active-organization`
- `invite-technician`
- `import-customers-assets`
- `manage-user-role`
- `e2e-role-fixture` (test)

Shared helpers:

- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/http.ts`

Required function environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INVITE_REDIRECT_URL` (optional but recommended)

Deployment note:

- Auth-protected functions are deployed with `--no-verify-jwt` in CI and perform auth in-function via `_shared/auth.ts` (`requireAuthenticatedUser` / `requireAdmin`).

## Mobile (Capacitor)

Config file: `capacitor.config.ts`

Build and sync web assets:

```bash
npm run build:mobile
npm run cap:sync
```

Open native projects:

```bash
npm run cap:open:ios
npm run cap:open:android
```

## Notes

- Runtime auth mode is explicit: use real Supabase by default, or set `VITE_DEMO_MODE=true` for demo mode.
- `npm run smoke:auth` runs with `--workers=1` to avoid shared-account org-switch races.
- Callback role-transition smoke (`tests/e2e/auth-org-role-callback.spec.ts`) runs only when dedicated credentials are set:
  `E2E_CALLBACK_ADMIN_EMAIL` and `E2E_CALLBACK_ADMIN_PASSWORD`.
- `smoke-admin` provisions deterministic fixture work orders at runtime; CI sets `E2E_STRICT_ADMIN_SMOKE=1` and fails on any skipped admin smoke test.
- Offline queue (IndexedDB) is implemented for work-order status/log/parts mutations.
- In-app notifications are available from realtime and offline sync events.
- Runtime artifacts are ignored: `output/`, `test-results/`, `playwright-report/`, `dist/`.
