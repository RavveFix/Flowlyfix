-- Server-side guardrails for billing status transitions.

create or replace function public.enforce_work_order_billing_rules()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  has_time_log boolean;
  has_parts_log boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.billing_status is not distinct from new.billing_status then
    return new;
  end if;

  if not (
    (old.billing_status = 'NONE' and new.billing_status = 'READY')
    or (old.billing_status = 'READY' and new.billing_status = 'SENT')
    or (old.billing_status = 'SENT' and new.billing_status = 'READY')
    or (old.billing_status = 'SENT' and new.billing_status = 'INVOICED')
  ) then
    raise exception 'Invalid billing status transition: % -> %', old.billing_status, new.billing_status
      using errcode = 'P0001',
            hint = 'Allowed transitions: NONE->READY, READY->SENT, SENT->READY, SENT->INVOICED';
  end if;

  -- Hard requirement for records that are READY or SENT: DONE + complete payload.
  if new.billing_status in ('READY', 'SENT') then
    if new.status <> 'DONE' then
      raise exception 'Billing requires work order status DONE before moving to %', new.billing_status
        using errcode = 'P0001';
    end if;

    if nullif(btrim(coalesce(new.technician_report, '')), '') is null then
      raise exception 'Billing requires technician report before moving to %', new.billing_status
        using errcode = 'P0001';
    end if;

    if new.technician_signed_by is null
      or nullif(btrim(coalesce(new.technician_signed_name, '')), '') is null
      or new.technician_signed_at is null then
      raise exception 'Billing requires technician signature before moving to %', new.billing_status
        using errcode = 'P0001';
    end if;

    select exists (
      select 1
      from public.work_logs wl
      where wl.organization_id = new.organization_id
        and wl.work_order_id = new.id
    )
    into has_time_log;

    if not has_time_log then
      raise exception 'Billing requires at least one work log before moving to %', new.billing_status
        using errcode = 'P0001';
    end if;

    select exists (
      select 1
      from public.work_order_parts wp
      where wp.organization_id = new.organization_id
        and wp.work_order_id = new.id
    )
    into has_parts_log;

    if not has_parts_log then
      raise exception 'Billing requires at least one part row before moving to %', new.billing_status
        using errcode = 'P0001';
    end if;
  end if;

  -- Admin-only transitions once a work order enters billing flow control.
  if (
    (old.billing_status = 'READY' and new.billing_status = 'SENT')
    or (old.billing_status = 'SENT' and new.billing_status = 'READY')
    or (old.billing_status = 'SENT' and new.billing_status = 'INVOICED')
  ) and not public.is_admin() then
    raise exception 'Only admins can perform billing transition % -> %', old.billing_status, new.billing_status
      using errcode = '42501';
  end if;

  if old.billing_status = 'READY' and new.billing_status = 'SENT' then
    if new.billing_sent_at is null then
      new.billing_sent_at = now();
    end if;
    if new.billing_sent_by is null then
      new.billing_sent_by = auth.uid();
    end if;
  end if;

  if old.billing_status = 'SENT' and new.billing_status = 'READY' then
    new.billing_sent_at = null;
    new.billing_sent_by = null;
  end if;

  if old.billing_status = 'SENT' and new.billing_status = 'INVOICED' then
    if new.invoiced_at is null then
      new.invoiced_at = now();
    end if;
    if new.invoiced_by is null then
      new.invoiced_by = auth.uid();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_work_order_billing_rules on public.work_orders;

create trigger trg_enforce_work_order_billing_rules
before update on public.work_orders
for each row execute function public.enforce_work_order_billing_rules();
