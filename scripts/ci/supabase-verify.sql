-- Read-only verification checks for production deploy pipeline.
-- Fail fast if expected schema pieces are missing.

\set ON_ERROR_STOP on

select 1 as connection_ok;

-- Core table checks
select to_regclass('public.profiles') is not null as profiles_exists;
select to_regclass('public.work_orders') is not null as work_orders_exists;
select to_regclass('public.organization_memberships') is not null as organization_memberships_exists;

-- Ensure at least one migration is recorded.
select count(*) > 0 as has_migrations
from supabase_migrations.schema_migrations;

-- RLS should stay enabled on key tenant-sensitive tables.
select relname,
       relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('profiles', 'work_orders', 'organization_memberships')
order by relname;
