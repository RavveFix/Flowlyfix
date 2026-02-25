-- Ensure ravon@fixverse.se is an ACTIVE ADMIN in both profiles and organization_memberships.
do $$
declare
  target_email text := 'ravon@fixverse.se';
  auth_id uuid;
  org_id uuid;
begin
  select id
  into auth_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if auth_id is null then
    raise notice 'Skipping ravon admin membership fix: no auth.users row found for %', target_email;
    return;
  end if;

  select coalesce(p.active_organization_id, p.organization_id)
  into org_id
  from public.profiles p
  where p.id = auth_id or lower(p.email) = lower(target_email)
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  if org_id is null then
    raise notice 'Skipping ravon admin membership fix: no organization could be inferred for %', target_email;
    return;
  end if;

  insert into public.profiles (id, organization_id, active_organization_id, email, full_name, role, status)
  values (auth_id, org_id, org_id, target_email, 'Ravon', 'ADMIN', 'ACTIVE')
  on conflict (id)
  do update
  set organization_id = excluded.organization_id,
      active_organization_id = excluded.active_organization_id,
      email = excluded.email,
      role = 'ADMIN',
      status = 'ACTIVE',
      updated_at = now();

  insert into public.organization_memberships (user_id, organization_id, role, status, is_default)
  values (auth_id, org_id, 'ADMIN', 'ACTIVE', true)
  on conflict (user_id, organization_id)
  do update
  set role = 'ADMIN',
      status = 'ACTIVE',
      is_default = true,
      updated_at = now();

  update public.organization_memberships
  set is_default = (organization_id = org_id),
      updated_at = now()
  where user_id = auth_id;
end;
$$;
