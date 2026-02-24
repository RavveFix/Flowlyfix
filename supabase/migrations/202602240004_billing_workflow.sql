-- Billing workflow: READY -> SENT -> INVOICED with technician/workshop sign-off

do $$
begin
  if not exists (select 1 from pg_type where typname = 'billing_status') then
    create type billing_status as enum ('NONE', 'READY', 'SENT', 'INVOICED');
  end if;
end;
$$;

alter table public.work_orders
  add column if not exists billing_status billing_status not null default 'NONE',
  add column if not exists technician_report text,
  add column if not exists technician_signed_by uuid references public.profiles(id) on delete set null,
  add column if not exists technician_signed_name text,
  add column if not exists technician_signed_at timestamptz,
  add column if not exists billing_ready_at timestamptz,
  add column if not exists billing_sent_at timestamptz,
  add column if not exists billing_sent_by uuid references public.profiles(id) on delete set null,
  add column if not exists invoiced_at timestamptz,
  add column if not exists invoiced_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_work_orders_org_billing_status
  on public.work_orders (organization_id, billing_status);

update public.work_orders
set
  billing_status = 'READY',
  billing_ready_at = coalesce(billing_ready_at, completed_at, now())
where status = 'DONE'
  and billing_status = 'NONE';

create or replace function public.log_work_order_changes()
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

    if old.billing_status is distinct from new.billing_status then
      payload = jsonb_build_object('from', old.billing_status, 'to', new.billing_status);
      insert into work_order_events (organization_id, work_order_id, actor_user_id, event_type, payload)
      values (new.organization_id, new.id, auth.uid(), 'WORK_ORDER_BILLING_STATUS_CHANGED', payload);

      if new.billing_status = 'READY' then
        insert into work_order_events (organization_id, work_order_id, actor_user_id, event_type, payload)
        values (new.organization_id, new.id, auth.uid(), 'WORK_ORDER_BILLING_READY', payload);
      end if;
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
