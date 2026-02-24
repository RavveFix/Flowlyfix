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

- SQL schema: `db/schema.sql`
- Migration copy: `supabase/migrations/202602240001_init_flowly_v1.sql`

Apply in Supabase SQL editor or via CLI migration flow.

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
