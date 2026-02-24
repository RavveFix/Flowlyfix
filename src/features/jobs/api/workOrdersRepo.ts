import { BillingStatus, JobStatus, WorkOrder } from '@/shared/types';
import { supabase } from '@/shared/lib/supabase/client';

export function normalizeWorkOrder(raw: any): WorkOrder {
  return {
    ...raw,
    title: raw.title ?? raw.description,
    billing_status: raw.billing_status ?? (raw.status === JobStatus.DONE ? BillingStatus.READY : BillingStatus.NONE),
    technician_report: raw.technician_report ?? null,
    technician_signed_by: raw.technician_signed_by ?? null,
    technician_signed_name: raw.technician_signed_name ?? null,
    technician_signed_at: raw.technician_signed_at ?? null,
    billing_ready_at: raw.billing_ready_at ?? null,
    billing_sent_at: raw.billing_sent_at ?? null,
    billing_sent_by: raw.billing_sent_by ?? null,
    invoiced_at: raw.invoiced_at ?? null,
    invoiced_by: raw.invoiced_by ?? null,
  } as WorkOrder;
}

export async function fetchWorkOrdersByOrganization(input: {
  organizationId: string;
  role?: string;
  userId?: string;
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  let query = supabase
    .from('work_orders')
    .select('*')
    .eq('organization_id', input.organizationId)
    .order('created_at', { ascending: false });

  if (input.role === 'TECHNICIAN') {
    query = query.eq('assigned_to_user_id', input.userId ?? '');
  }

  const { data, error } = await query;
  return {
    data: ((data as any[]) ?? []).map(normalizeWorkOrder),
    error,
  };
}

export async function insertWorkOrderRow(input: {
  organizationId: string;
  payload: Record<string, unknown>;
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const { data, error } = await supabase.from('work_orders').insert(input.payload).select('*').single();
  return {
    data: data ? normalizeWorkOrder(data) : null,
    error,
  };
}

export async function updateWorkOrderRow(input: {
  organizationId: string;
  workOrderId: string;
  updates: Record<string, unknown>;
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase
    .from('work_orders')
    .update(input.updates)
    .eq('id', input.workOrderId)
    .eq('organization_id', input.organizationId);
}

export async function fetchWorkOrderStatus(input: { organizationId: string; workOrderId: string }) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase
    .from('work_orders')
    .select('status')
    .eq('id', input.workOrderId)
    .eq('organization_id', input.organizationId)
    .maybeSingle();
}
