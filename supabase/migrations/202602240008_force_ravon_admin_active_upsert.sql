-- Hardening fix: ensure ravon@fixverse.se always has an ADMIN+ACTIVE profile
-- linked to the exact auth.users id.
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
    raise notice 'Skipping ravon hardening fix: no auth.users row found for %', target_email;
    return;
  end if;

  select p.organization_id
  into org_id
  from public.profiles p
  where lower(p.email) = lower(target_email)
  order by p.updated_at desc nulls last, p.created_at desc nulls last
  limit 1;

  if org_id is null then
    raise notice 'Skipping ravon hardening fix: no organization could be inferred for %', target_email;
    return;
  end if;

  insert into public.profiles (id, organization_id, email, full_name, role, status)
  values (auth_id, org_id, target_email, 'Ravon', 'ADMIN', 'ACTIVE')
  on conflict (id)
  do update
  set organization_id = excluded.organization_id,
      email = excluded.email,
      role = 'ADMIN',
      status = 'ACTIVE',
      updated_at = now();
end;
$$;
