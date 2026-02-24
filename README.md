# Flowly v1 (Web + Mobile + Supabase)

Flowly is a field-service system for service companies (first case: coffee machine service teams).

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
GEMINI_API_KEY=... # optional, for AI assistant widget
```

3. Run dev server:

```bash
npm run dev
```

4. Run typecheck + build:

```bash
npm run typecheck
npm run build
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

- If Supabase env vars are missing, app runs in demo fallback mode.
- Offline queue (IndexedDB) is implemented for work-order status/log/parts mutations.
- In-app notifications are available from realtime and offline sync events.
- Runtime artifacts are ignored: `output/`, `test-results/`, `playwright-report/`, `dist/`.
