-- Fixes Supabase linter warnings for:
-- 1) auth_rls_initplan (wrap auth.uid() calls in SELECT inside RLS policies)
-- 2) multiple_permissive_policies (remove overlapping FOR ALL permissive policies)

alter policy "Users can update own profile or admin can update all"
on public.profiles
using (
  organization_id = current_org_id()
  and (id = (select auth.uid()) or is_admin())
)
with check (
  organization_id = current_org_id()
  and (id = (select auth.uid()) or is_admin())
);

alter policy "Work orders visible to admin and assigned technician"
on public.work_orders
using (
  organization_id = current_org_id()
  and (
    is_admin()
    or assigned_to_user_id = (select auth.uid())
  )
);

drop policy if exists "Admins update any work order" on public.work_orders;
drop policy if exists "Assigned technicians update own work orders" on public.work_orders;

create policy "Admins or assigned technicians update work orders"
on public.work_orders
for update
using (
  organization_id = current_org_id()
  and (
    is_admin()
    or assigned_to_user_id = (select auth.uid())
  )
)
with check (
  organization_id = current_org_id()
  and (
    is_admin()
    or assigned_to_user_id = (select auth.uid())
  )
);

alter policy "Admins and assigned technicians can insert work logs"
on public.work_logs
with check (
  organization_id = current_org_id()
  and (
    is_admin()
    or (
      technician_id = (select auth.uid())
      and is_assigned_technician(work_order_id)
    )
  )
);

drop policy if exists "Admin manages customers" on public.customers;

create policy "Admin inserts customers"
on public.customers
for insert
with check (organization_id = current_org_id() and is_admin());

create policy "Admin updates customers"
on public.customers
for update
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Admin deletes customers"
on public.customers
for delete
using (organization_id = current_org_id() and is_admin());

drop policy if exists "Admin manages customer sites" on public.customer_sites;

create policy "Admin inserts customer sites"
on public.customer_sites
for insert
with check (organization_id = current_org_id() and is_admin());

create policy "Admin updates customer sites"
on public.customer_sites
for update
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Admin deletes customer sites"
on public.customer_sites
for delete
using (organization_id = current_org_id() and is_admin());

drop policy if exists "Admin manages assets" on public.assets;

create policy "Admin inserts assets"
on public.assets
for insert
with check (organization_id = current_org_id() and is_admin());

create policy "Admin updates assets"
on public.assets
for update
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Admin deletes assets"
on public.assets
for delete
using (organization_id = current_org_id() and is_admin());

drop policy if exists "Admin manages inventory" on public.inventory_items;

create policy "Admin inserts inventory"
on public.inventory_items
for insert
with check (organization_id = current_org_id() and is_admin());

create policy "Admin updates inventory"
on public.inventory_items
for update
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Admin deletes inventory"
on public.inventory_items
for delete
using (organization_id = current_org_id() and is_admin());

drop policy if exists "Admins can update/delete work logs" on public.work_logs;

create policy "Admins can update work logs"
on public.work_logs
for update
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Admins can delete work logs"
on public.work_logs
for delete
using (organization_id = current_org_id() and is_admin());

drop policy if exists "Admins can update/delete parts" on public.work_order_parts;

create policy "Admins can update parts"
on public.work_order_parts
for update
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Admins can delete parts"
on public.work_order_parts
for delete
using (organization_id = current_org_id() and is_admin());
