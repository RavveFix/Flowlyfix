-- Flowly v1 schema (multi-tenant, RLS, realtime-friendly)

create extension if not exists pgcrypto;

create type user_role as enum ('ADMIN', 'TECHNICIAN');
create type job_type as enum ('FIELD', 'WORKSHOP');
create type job_status as enum (
  'OPEN',
  'ASSIGNED',
  'TRAVELING',
  'IN_PROGRESS',
  'DONE',
  'CANCELED',
  'WORKSHOP_RECEIVED',
  'WORKSHOP_TROUBLESHOOTING',
  'WORKSHOP_WAITING_PARTS',
  'WORKSHOP_READY',
  'WEB_PENDING'
);
create type job_priority as enum ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  full_name text not null,
  role user_role not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_profiles_org_email on profiles (organization_id, lower(email));
create index idx_profiles_org_role on profiles (organization_id, role);

create table customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  org_number text,
  external_fortnox_id text,
  address text not null default '',
  contact_person text,
  contact_phone text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_customers_org_name on customers (organization_id, lower(name));
create unique index idx_customers_org_number on customers (organization_id, org_number) where org_number is not null;

create table customer_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  address text not null,
  contact_person text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customer_sites_org_customer on customer_sites (organization_id, customer_id);

create table assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  customer_site_id uuid references customer_sites(id) on delete set null,
  name text not null,
  model text not null,
  serial_number text not null,
  qr_code_id text,
  location_in_building text,
  install_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_assets_org_serial on assets (organization_id, lower(serial_number));
create unique index idx_assets_org_qr on assets (organization_id, qr_code_id) where qr_code_id is not null;
create index idx_assets_org_customer on assets (organization_id, customer_id);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  sku text not null,
  name text not null,
  stock_qty integer not null default 0,
  unit_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_stock_non_negative check (stock_qty >= 0)
);

create unique index idx_inventory_org_sku on inventory_items (organization_id, lower(sku));

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete restrict,
  asset_id uuid references assets(id) on delete set null,
  assigned_to_user_id uuid references profiles(id) on delete set null,
  job_type job_type not null,
  status job_status not null default 'OPEN',
  priority job_priority not null default 'NORMAL',
  title text not null,
  description text not null,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  completed_at timestamptz,
  contact_name text,
  contact_phone text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_work_orders_org_status on work_orders (organization_id, status);
create index idx_work_orders_org_assigned on work_orders (organization_id, assigned_to_user_id);
create index idx_work_orders_org_sched on work_orders (organization_id, scheduled_start);

create table work_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  technician_id uuid not null references profiles(id) on delete restrict,
  description text not null,
  minutes integer not null default 0,
  created_at timestamptz not null default now(),
  constraint work_logs_minutes_non_negative check (minutes >= 0)
);

create index idx_work_logs_org_order on work_logs (organization_id, work_order_id);

create table work_order_parts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  inventory_item_id uuid references inventory_items(id) on delete set null,
  part_name text not null,
  sku text,
  qty integer not null,
  unit_cost numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint work_order_parts_qty_positive check (qty > 0)
);

create index idx_work_order_parts_org_order on work_order_parts (organization_id, work_order_id);

create table work_order_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  actor_user_id uuid references profiles(id) on delete set null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index idx_work_order_events_org_order on work_order_events (organization_id, work_order_id, created_at desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_org_updated_at
before update on organizations
for each row execute function set_updated_at();

create trigger trg_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

create trigger trg_customers_updated_at
before update on customers
for each row execute function set_updated_at();

create trigger trg_sites_updated_at
before update on customer_sites
for each row execute function set_updated_at();

create trigger trg_assets_updated_at
before update on assets
for each row execute function set_updated_at();

create trigger trg_inventory_updated_at
before update on inventory_items
for each row execute function set_updated_at();

create trigger trg_work_orders_updated_at
before update on work_orders
for each row execute function set_updated_at();

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from profiles where id = auth.uid();
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
    from profiles
    where id = auth.uid()
      and role = 'ADMIN'
  );
$$;

create or replace function public.is_assigned_technician(order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from work_orders wo
    where wo.id = order_id
      and wo.assigned_to_user_id = auth.uid()
      and wo.organization_id = current_org_id()
  );
$$;

create or replace function consume_inventory_for_part()
returns trigger
language plpgsql
as $$
declare
  item_record inventory_items;
begin
  if new.inventory_item_id is null then
    new.total_cost = coalesce(new.unit_cost, 0) * new.qty;
    return new;
  end if;

  select * into item_record
  from inventory_items
  where id = new.inventory_item_id
    and organization_id = new.organization_id
  for update;

  if item_record.id is null then
    raise exception 'Inventory item not found in organization';
  end if;

  if item_record.stock_qty < new.qty then
    raise exception 'Insufficient stock for % (available %, requested %)', item_record.sku, item_record.stock_qty, new.qty;
  end if;

  if coalesce(new.sku, '') = '' then
    new.sku = item_record.sku;
  end if;

  if coalesce(new.unit_cost, 0) = 0 then
    new.unit_cost = item_record.unit_cost;
  end if;

  update inventory_items
  set stock_qty = stock_qty - new.qty,
      updated_at = now()
  where id = item_record.id;

  new.total_cost = new.unit_cost * new.qty;
  return new;
end;
$$;

create trigger trg_work_order_parts_consume_inventory
before insert on work_order_parts
for each row execute function consume_inventory_for_part();

create or replace function log_work_order_changes()
returns trigger
language plpgsql
as $$
declare
  payload jsonb;
begin
  if tg_op = 'INSERT' then
    payload = jsonb_build_object('status', new.status, 'assigned_to_user_id', new.assigned_to_user_id);
    insert into work_order_events (organization_id, work_order_id, actor_user_id, event_type, payload)
    values (new.organization_id, new.id, auth.uid(), 'WORK_ORDER_CREATED', payload);
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      payload = jsonb_build_object('from', old.status, 'to', new.status);
      insert into work_order_events (organization_id, work_order_id, actor_user_id, event_type, payload)
      values (new.organization_id, new.id, auth.uid(), 'WORK_ORDER_STATUS_CHANGED', payload);
    end if;

    if old.assigned_to_user_id is distinct from new.assigned_to_user_id then
      payload = jsonb_build_object('from', old.assigned_to_user_id, 'to', new.assigned_to_user_id);
      insert into work_order_events (organization_id, work_order_id, actor_user_id, event_type, payload)
      values (new.organization_id, new.id, auth.uid(), 'WORK_ORDER_ASSIGNED', payload);
    end if;

    if old.priority is distinct from new.priority then
      payload = jsonb_build_object('from', old.priority, 'to', new.priority);
      insert into work_order_events (organization_id, work_order_id, actor_user_id, event_type, payload)
      values (new.organization_id, new.id, auth.uid(), 'WORK_ORDER_PRIORITY_CHANGED', payload);
    end if;

    return new;
  end if;

  return new;
end;
$$;

create trigger trg_work_order_events
after insert or update on work_orders
for each row execute function log_work_order_changes();

create or replace function log_work_log_created()
returns trigger
language plpgsql
as $$
begin
  insert into work_order_events (organization_id, work_order_id, actor_user_id, event_type, payload)
  values (
    new.organization_id,
    new.work_order_id,
    new.technician_id,
    'WORK_LOG_ADDED',
    jsonb_build_object('minutes', new.minutes)
  );
  return new;
end;
$$;

create trigger trg_work_log_events
after insert on work_logs
for each row execute function log_work_log_created();

create or replace function log_work_part_created()
returns trigger
language plpgsql
as $$
begin
  insert into work_order_events (organization_id, work_order_id, actor_user_id, event_type, payload)
  values (
    new.organization_id,
    new.work_order_id,
    auth.uid(),
    'WORK_PART_ADDED',
    jsonb_build_object('part_name', new.part_name, 'qty', new.qty, 'total_cost', new.total_cost)
  );
  return new;
end;
$$;

create trigger trg_work_part_events
after insert on work_order_parts
for each row execute function log_work_part_created();

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table customer_sites enable row level security;
alter table assets enable row level security;
alter table inventory_items enable row level security;
alter table work_orders enable row level security;
alter table work_logs enable row level security;
alter table work_order_parts enable row level security;
alter table work_order_events enable row level security;

create policy "Organizations visible in own tenant"
on organizations
for select
using (id = current_org_id());

create policy "Admins update own organization"
on organizations
for update
using (id = current_org_id() and is_admin())
with check (id = current_org_id() and is_admin());

create policy "Profiles visible in own tenant"
on profiles
for select
using (organization_id = current_org_id());

create policy "Users can update own profile or admin can update all"
on profiles
for update
using (
  organization_id = current_org_id()
  and (id = auth.uid() or is_admin())
)
with check (
  organization_id = current_org_id()
  and (id = auth.uid() or is_admin())
);

create policy "Admin creates profiles"
on profiles
for insert
with check (organization_id = current_org_id() and is_admin());

create policy "Admin can delete profiles"
on profiles
for delete
using (organization_id = current_org_id() and is_admin());

create policy "Customers in own tenant"
on customers
for select
using (organization_id = current_org_id());

create policy "Admin manages customers"
on customers
for all
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Customer sites in own tenant"
on customer_sites
for select
using (organization_id = current_org_id());

create policy "Admin manages customer sites"
on customer_sites
for all
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Assets in own tenant"
on assets
for select
using (organization_id = current_org_id());

create policy "Admin manages assets"
on assets
for all
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Inventory visible in own tenant"
on inventory_items
for select
using (organization_id = current_org_id());

create policy "Admin manages inventory"
on inventory_items
for all
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Work orders visible to admin and assigned technician"
on work_orders
for select
using (
  organization_id = current_org_id()
  and (
    is_admin()
    or assigned_to_user_id = auth.uid()
  )
);

create policy "Admins create work orders"
on work_orders
for insert
with check (organization_id = current_org_id() and is_admin());

create policy "Admins update any work order"
on work_orders
for update
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id());

create policy "Assigned technicians update own work orders"
on work_orders
for update
using (
  organization_id = current_org_id()
  and assigned_to_user_id = auth.uid()
)
with check (
  organization_id = current_org_id()
  and assigned_to_user_id = auth.uid()
);

create policy "Admins delete work orders"
on work_orders
for delete
using (organization_id = current_org_id() and is_admin());

create policy "Work logs visible in own tenant"
on work_logs
for select
using (organization_id = current_org_id());

create policy "Admins and assigned technicians can insert work logs"
on work_logs
for insert
with check (
  organization_id = current_org_id()
  and (
    is_admin()
    or (
      technician_id = auth.uid()
      and is_assigned_technician(work_order_id)
    )
  )
);

create policy "Admins can update/delete work logs"
on work_logs
for all
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Work order parts visible in own tenant"
on work_order_parts
for select
using (organization_id = current_org_id());

create policy "Admins and assigned technicians can insert parts"
on work_order_parts
for insert
with check (
  organization_id = current_org_id()
  and (
    is_admin()
    or is_assigned_technician(work_order_id)
  )
);

create policy "Admins can update/delete parts"
on work_order_parts
for all
using (organization_id = current_org_id() and is_admin())
with check (organization_id = current_org_id() and is_admin());

create policy "Work order events visible in own tenant"
on work_order_events
for select
using (organization_id = current_org_id());

create policy "Tenant users can insert events"
on work_order_events
for insert
with check (organization_id = current_org_id());

-- Realtime
do $$
begin
  alter publication supabase_realtime add table work_orders;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table work_order_events;
exception
  when duplicate_object then null;
end $$;
