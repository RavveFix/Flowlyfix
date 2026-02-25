-- Hotfix: ensure ravon@fixverse.se profile is linked to auth.users id and has active admin privileges.
do $$
declare
  target_email text := 'ravon@fixverse.se';
  auth_id uuid;
  existing_profile_id uuid;
  existing_org_id uuid;
begin
  select id
  into auth_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if auth_id is null then
    raise notice 'Skipping ravon hotfix: no auth.users row found for %', target_email;
    return;
  end if;

  -- Already linked profile: just enforce role/status/email.
  if exists (select 1 from public.profiles where id = auth_id) then
    update public.profiles
    set email = target_email,
        role = 'ADMIN',
        status = 'ACTIVE'
    where id = auth_id;
    return;
  end if;

  -- Find an existing profile by email and reuse its org.
  select id, organization_id
  into existing_profile_id, existing_org_id
  from public.profiles
  where lower(email) = lower(target_email)
  limit 1;

  if existing_profile_id is null then
    raise notice 'Skipping ravon hotfix: no profiles row found for %', target_email;
    return;
  end if;

  -- Move profile row to auth id so requireAdmin() can resolve it.
  update public.profiles
  set id = auth_id,
      email = target_email,
      role = 'ADMIN',
      status = 'ACTIVE',
      organization_id = existing_org_id
  where id = existing_profile_id;
end;
$$;
