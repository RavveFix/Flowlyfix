-- J1: Tighten RLS SELECT policies for work_logs and work_order_parts.
-- Previously any authenticated user in the org could read ALL work logs and parts.
-- Now technicians can only see logs/parts for their assigned work orders.

-- work_logs: restrict SELECT to admin or assigned technician
drop policy if exists "Work logs visible in own tenant" on public.work_logs;

create policy "Work logs visible to admin or assigned technician"
on public.work_logs
for select
using (
  organization_id = current_org_id()
  and (
    is_org_admin()
    or is_assigned_technician(work_order_id)
  )
);

-- work_order_parts: restrict SELECT to admin or assigned technician
drop policy if exists "Work order parts visible in own tenant" on public.work_order_parts;

create policy "Work order parts visible to admin or assigned technician"
on public.work_order_parts
for select
using (
  organization_id = current_org_id()
  and (
    is_org_admin()
    or is_assigned_technician(work_order_id)
  )
);

-- J5: Add composite index for RLS helper function performance.
-- is_org_admin() and current_org_id() query organization_memberships on every request.
create index if not exists idx_org_memberships_user_org_active
  on public.organization_memberships(user_id, organization_id)
  where status = 'ACTIVE';
