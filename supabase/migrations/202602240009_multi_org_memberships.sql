-- Multi-org foundation: memberships, invites, active organization context, and guardrails.

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role user_role not null,
  status user_status not null default 'ACTIVE',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_memberships_user_org_unique unique (user_id, organization_id)
);

create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role user_role not null,
  status text not null,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_invites_status_check check (status in ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'))
);

create unique index if not exists idx_org_invites_pending_unique
  on public.organization_invites (organization_id, lower(email))
  where status = 'PENDING';

create index if not exists idx_org_memberships_user on public.organization_memberships (user_id);
create index if not exists idx_org_memberships_org on public.organization_memberships (organization_id);
create index if not exists idx_org_memberships_org_role_status on public.organization_memberships (organization_id, role, status);
create index if not exists idx_org_invites_org_status on public.organization_invites (organization_id, status);

create trigger trg_org_memberships_updated_at
before update on public.organization_memberships
for each row execute function set_updated_at();

create trigger trg_org_invites_updated_at
before update on public.organization_invites
for each row execute function set_updated_at();

alter table public.profiles
  add column if not exists active_organization_id uuid references public.organizations(id) on delete set null;

insert into public.organization_memberships (user_id, organization_id, role, status, is_default)
select
  p.id,
  p.organization_id,
  p.role,
  p.status,
  true
from public.profiles p
where not exists (
  select 1
  from public.organization_memberships m
  where m.user_id = p.id
    and m.organization_id = p.organization_id
);

with default_org as (
  select distinct on (m.user_id)
    m.user_id,
    m.organization_id
  from public.organization_memberships m
  order by m.user_id, m.is_default desc, m.created_at asc
)
update public.profiles p
set active_organization_id = d.organization_id
from default_org d
where p.id = d.user_id
  and p.active_organization_id is null;

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select active_organization_id
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.user_in_current_org(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.user_id = target_user
      and m.organization_id = current_org_id()
  );
$$;

create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.user_id = auth.uid()
      and m.organization_id = current_org_id()
      and m.role = 'ADMIN'
      and m.status = 'ACTIVE'
  );
$$;

-- Backward compatible alias for policies/functions that still call is_admin().
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_org_admin();
$$;

create or replace function public.ensure_not_last_active_admin_membership(
  org_id uuid,
  target_user_id uuid,
  next_role user_role,
  next_status user_status
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  active_admin_count integer;
  target_is_active_admin boolean;
begin
  select exists (
    select 1
    from public.organization_memberships
    where organization_id = org_id
      and user_id = target_user_id
      and role = 'ADMIN'
      and status = 'ACTIVE'
  ) into target_is_active_admin;

  if not target_is_active_admin then
    return true;
  end if;

  if next_role = 'ADMIN' and next_status = 'ACTIVE' then
    return true;
  end if;

  select count(*)
  into active_admin_count
  from public.organization_memberships
  where organization_id = org_id
    and role = 'ADMIN'
    and status = 'ACTIVE';

  return active_admin_count > 1;
end;
$$;

create or replace function public.enforce_membership_admin_guardrails()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Changing organization_id is not allowed for organization_memberships'
        using errcode = '42501';
    end if;

    if not public.ensure_not_last_active_admin_membership(old.organization_id, old.user_id, new.role, new.status) then
      raise exception 'Cannot remove role/status from the last active admin in organization'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if not public.ensure_not_last_active_admin_membership(old.organization_id, old.user_id, 'TECHNICIAN', 'INACTIVE') then
      raise exception 'Cannot delete the last active admin in organization'
        using errcode = '42501';
    end if;

    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_enforce_membership_admin_guardrails on public.organization_memberships;
create trigger trg_enforce_membership_admin_guardrails
before update or delete on public.organization_memberships
for each row execute function public.enforce_membership_admin_guardrails();

alter table public.organization_memberships enable row level security;
alter table public.organization_invites enable row level security;

-- Profiles are now visible by organization memberships, not legacy profile.organization_id.
drop policy if exists "Profiles visible in own tenant" on public.profiles;
create policy "Profiles visible in active organization"
on public.profiles
for select
using (public.user_in_current_org(id));

drop policy if exists "Users can update own profile or admin can update all" on public.profiles;
create policy "Users can update own profile or org admin can update all"
on public.profiles
for update
using (
  id = (select auth.uid())
  or (public.is_org_admin() and public.user_in_current_org(id))
)
with check (
  id = (select auth.uid())
  or (public.is_org_admin() and public.user_in_current_org(id))
);

drop policy if exists "Admin creates profiles" on public.profiles;
create policy "Users can create own profile"
on public.profiles
for insert
with check (id = (select auth.uid()));

drop policy if exists "Admin can delete profiles" on public.profiles;
create policy "Org admin can delete profiles in active organization"
on public.profiles
for delete
using (public.is_org_admin() and public.user_in_current_org(id));

create policy "Users read own memberships"
on public.organization_memberships
for select
using (user_id = (select auth.uid()));

create policy "Org admins read memberships in active organization"
on public.organization_memberships
for select
using (organization_id = current_org_id() and public.is_org_admin());

create policy "Org admins insert memberships in active organization"
on public.organization_memberships
for insert
with check (organization_id = current_org_id() and public.is_org_admin());

create policy "Org admins update memberships in active organization"
on public.organization_memberships
for update
using (organization_id = current_org_id() and public.is_org_admin())
with check (organization_id = current_org_id() and public.is_org_admin());

create policy "Org admins delete memberships in active organization"
on public.organization_memberships
for delete
using (organization_id = current_org_id() and public.is_org_admin());

create policy "Users read own invites by email"
on public.organization_invites
for select
using (lower(email) = lower(coalesce((select auth.email()), '')));

create policy "Org admins manage invites in active organization"
on public.organization_invites
for all
using (organization_id = current_org_id() and public.is_org_admin())
with check (organization_id = current_org_id() and public.is_org_admin());
