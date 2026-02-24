-- User lifecycle guardrails: active/inactive users, safe role transitions, and last-admin protection.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_status') then
    create type user_status as enum ('ACTIVE', 'INACTIVE');
  end if;
end;
$$;

alter table public.profiles
  add column if not exists status user_status;

update public.profiles
set status = 'ACTIVE'
where status is null;

alter table public.profiles
  alter column status set default 'ACTIVE',
  alter column status set not null;

create index if not exists idx_profiles_org_status on public.profiles (organization_id, status);

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.profiles
  where id = auth.uid()
    and status = 'ACTIVE';
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'ADMIN'
      and status = 'ACTIVE'
  );
$$;

create or replace function public.ensure_not_last_active_admin(
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
    from public.profiles
    where organization_id = org_id
      and id = target_user_id
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
  from public.profiles
  where organization_id = org_id
    and role = 'ADMIN'
    and status = 'ACTIVE'
  into active_admin_count;

  return active_admin_count > 1;
end;
$$;

create or replace function public.enforce_profile_admin_guardrails()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id then
      raise exception 'Changing organization_id is not allowed for profiles'
        using errcode = '42501';
    end if;

    if not public.ensure_not_last_active_admin(old.organization_id, old.id, new.role, new.status) then
      raise exception 'Cannot remove role/status from the last active admin in organization'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'ADMIN' and old.status = 'ACTIVE' then
      if (
        select count(*)
        from public.profiles p
        where p.organization_id = old.organization_id
          and p.role = 'ADMIN'
          and p.status = 'ACTIVE'
      ) <= 1 then
        raise exception 'Cannot delete the last active admin in organization'
          using errcode = '42501';
      end if;
    end if;

    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_enforce_profile_admin_guardrails on public.profiles;

create trigger trg_enforce_profile_admin_guardrails
before update or delete on public.profiles
for each row execute function public.enforce_profile_admin_guardrails();

alter policy "Users can update own profile or admin can update all"
on public.profiles
using (
  organization_id = current_org_id()
  and (id = (select auth.uid()) or is_admin())
  and ensure_not_last_active_admin(organization_id, id, role, status)
)
with check (
  organization_id = current_org_id()
  and (id = (select auth.uid()) or is_admin())
  and ensure_not_last_active_admin(organization_id, id, role, status)
);

alter policy "Admin can delete profiles"
on public.profiles
using (
  organization_id = current_org_id()
  and is_admin()
  and ensure_not_last_active_admin(organization_id, id, role, status)
);
