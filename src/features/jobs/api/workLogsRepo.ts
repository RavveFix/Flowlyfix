import { supabase } from '@/shared/lib/supabase/client';
import { WorkOrderTimeLog } from '@/shared/types';

export async function fetchWorkLogsByOrderIds(input: { organizationId: string; jobIds: string[] }) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase
    .from('work_logs')
    .select('id, work_order_id, description, minutes, created_at')
    .eq('organization_id', input.organizationId)
    .in('work_order_id', input.jobIds)
    .order('created_at', { ascending: true });
}

export async function addWorkLogRow(input: {
  organizationId: string;
  workOrderId: string;
  technicianId?: string;
  entry: WorkOrderTimeLog;
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase.from('work_logs').insert({
    organization_id: input.organizationId,
    work_order_id: input.workOrderId,
    technician_id: input.technicianId,
    description: input.entry.description,
    minutes: input.entry.minutes,
  });
}

export async function replaceWorkLogsForOrder(input: {
  organizationId: string;
  workOrderId: string;
  technicianId: string;
  entries: WorkOrderTimeLog[];
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const { error: deleteLogsError } = await supabase
    .from('work_logs')
    .delete()
    .eq('organization_id', input.organizationId)
    .eq('work_order_id', input.workOrderId);

  if (deleteLogsError) {
    return { error: deleteLogsError };
  }

  if (input.entries.length === 0) {
    return { error: null };
  }

  const { error } = await supabase.from('work_logs').insert(
    input.entries.map((entry) => ({
      organization_id: input.organizationId,
      work_order_id: input.workOrderId,
      technician_id: input.technicianId,
      description: entry.description,
      minutes: entry.minutes,
    })),
  );

  return { error };
}
