-- Repair potential identity mismatch for ravon@fixverse.se across auth/profiles/memberships.
do $$
declare
  target_email text := 'ravon@fixverse.se';
begin
  with candidate_ids as (
    select id as user_id
    from auth.users
    where lower(email) = lower(target_email)
    union
    select p.id as user_id
    from public.profiles p
    where lower(p.email) = lower(target_email)
  ),
  admin_org as (
    select distinct on (m.user_id)
      m.user_id,
      m.organization_id
    from public.organization_memberships m
    join candidate_ids c on c.user_id = m.user_id
    order by m.user_id, m.is_default desc, m.updated_at desc, m.created_at desc
  )
  update public.organization_memberships m
  set role = 'ADMIN',
      status = 'ACTIVE',
      updated_at = now()
  where m.user_id in (select user_id from candidate_ids);

  update public.profiles p
  set role = 'ADMIN',
      status = 'ACTIVE',
      organization_id = coalesce(a.organization_id, p.organization_id),
      active_organization_id = coalesce(a.organization_id, p.active_organization_id, p.organization_id),
      updated_at = now()
  from (
    select distinct on (m.user_id)
      m.user_id,
      m.organization_id
    from public.organization_memberships m
    join (
      select id as user_id from auth.users where lower(email) = lower(target_email)
      union
      select p2.id as user_id from public.profiles p2 where lower(p2.email) = lower(target_email)
    ) c on c.user_id = m.user_id
    where m.status = 'ACTIVE'
    order by m.user_id, (m.role = 'ADMIN') desc, m.is_default desc, m.updated_at desc, m.created_at desc
  ) a
  where p.id = a.user_id
     or lower(p.email) = lower(target_email);
end;
$$;
