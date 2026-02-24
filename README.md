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
```

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

- `invite-technician`
- `import-customers-assets`

Shared helpers:

- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/http.ts`

Required function environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INVITE_REDIRECT_URL` (optional but recommended)

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
- Offline queue (IndexedDB) is implemented for work-order status/log/parts mutations.
- In-app notifications are available from realtime and offline sync events.
- Runtime artifacts are ignored: `output/`, `test-results/`, `playwright-report/`, `dist/`.
