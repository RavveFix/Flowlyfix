-- Keep legacy profile role/org fields aligned with active membership context,
-- and store a minimal audit trail for role changes.

create table if not exists public.membership_role_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  from_role user_role,
  to_role user_role not null,
  from_status user_status,
  to_status user_status not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_role_audit_org_created
  on public.membership_role_audit_logs (organization_id, created_at desc);

create index if not exists idx_role_audit_target_created
  on public.membership_role_audit_logs (target_user_id, created_at desc);

alter table public.membership_role_audit_logs enable row level security;

drop policy if exists "Org admins read role audit logs in active organization" on public.membership_role_audit_logs;
create policy "Org admins read role audit logs in active organization"
on public.membership_role_audit_logs
for select
using (organization_id = current_org_id() and public.is_org_admin());

create or replace function public.sync_profile_legacy_from_memberships(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_active_org uuid;
  next_active_org uuid;
  next_role user_role;
  next_status user_status;
begin
  select p.active_organization_id
  into current_active_org
  from public.profiles p
  where p.id = target_user_id;

  select m.organization_id
  into next_active_org
  from public.organization_memberships m
  where m.user_id = target_user_id
    and m.status = 'ACTIVE'
  order by (m.organization_id = current_active_org) desc, m.is_default desc, m.updated_at desc, m.created_at desc
  limit 1;

  if next_active_org is null then
    select m.organization_id
    into next_active_org
    from public.organization_memberships m
    where m.user_id = target_user_id
    order by (m.organization_id = current_active_org) desc, m.is_default desc, m.updated_at desc, m.created_at desc
    limit 1;
  end if;

  if next_active_org is null then
    return;
  end if;

  select m.role, m.status
  into next_role, next_status
  from public.organization_memberships m
  where m.user_id = target_user_id
    and m.organization_id = next_active_org
  order by (m.status = 'ACTIVE') desc, m.updated_at desc, m.created_at desc
  limit 1;

  if next_role is null or next_status is null then
    return;
  end if;

  update public.profiles p
  set organization_id = next_active_org,
      active_organization_id = next_active_org,
      role = next_role,
      status = next_status,
      updated_at = now()
  where p.id = target_user_id;
end;
$$;

create or replace function public.sync_profile_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_profile_legacy_from_memberships(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_profile_after_membership_change on public.organization_memberships;
create trigger trg_sync_profile_after_membership_change
after insert or update or delete on public.organization_memberships
for each row execute function public.sync_profile_after_membership_change();

do $$
declare
  entry record;
begin
  for entry in
    select distinct m.user_id
    from public.organization_memberships m
  loop
    perform public.sync_profile_legacy_from_memberships(entry.user_id);
  end loop;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table organization_memberships;
exception
  when duplicate_object then null;
end $$;
