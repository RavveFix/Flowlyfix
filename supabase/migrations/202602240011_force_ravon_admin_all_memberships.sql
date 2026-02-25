-- Ensure ravon@fixverse.se is ACTIVE ADMIN across all memberships.
do $$
declare
  target_email text := 'ravon@fixverse.se';
  auth_id uuid;
begin
  select id
  into auth_id
  from auth.users
  where lower(email) = lower(target_email)
  order by created_at asc
  limit 1;

  if auth_id is null then
    raise notice 'Skipping ravon admin-all-memberships fix: no auth.users row found for %', target_email;
    return;
  end if;

  update public.organization_memberships
  set role = 'ADMIN',
      status = 'ACTIVE',
      updated_at = now()
  where user_id = auth_id;

  update public.profiles
  set role = 'ADMIN',
      status = 'ACTIVE',
      updated_at = now()
  where id = auth_id;
end;
$$;
