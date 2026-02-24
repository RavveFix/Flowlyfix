import { supabase } from '@/shared/lib/supabase/client';
import { WorkOrderPartLog } from '@/shared/types';

function toCostValues(part: WorkOrderPartLog) {
  const unitCost = Math.max(part.cost / Math.max(part.qty, 1), 0);
  return {
    unit_cost: Number(unitCost.toFixed(2)),
    total_cost: Number(part.cost.toFixed(2)),
  };
}

export async function fetchWorkPartsByOrderIds(input: { organizationId: string; jobIds: string[] }) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return supabase
    .from('work_order_parts')
    .select('id, work_order_id, part_name, qty, total_cost, inventory_item_id, created_at')
    .eq('organization_id', input.organizationId)
    .in('work_order_id', input.jobIds)
    .order('created_at', { ascending: true });
}

export async function addWorkPartRow(input: {
  organizationId: string;
  workOrderId: string;
  part: WorkOrderPartLog;
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const costs = toCostValues(input.part);
  return supabase.from('work_order_parts').insert({
    organization_id: input.organizationId,
    work_order_id: input.workOrderId,
    inventory_item_id: input.part.inventory_item_id ?? null,
    part_name: input.part.part_name,
    qty: input.part.qty,
    ...costs,
  });
}

export async function replaceWorkPartsForOrder(input: {
  organizationId: string;
  workOrderId: string;
  entries: WorkOrderPartLog[];
}) {
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const { error: deletePartsError } = await supabase
    .from('work_order_parts')
    .delete()
    .eq('organization_id', input.organizationId)
    .eq('work_order_id', input.workOrderId);

  if (deletePartsError) {
    return { error: deletePartsError };
  }

  if (input.entries.length === 0) {
    return { error: null };
  }

  const rows = input.entries.map((entry) => ({
    organization_id: input.organizationId,
    work_order_id: input.workOrderId,
    inventory_item_id: entry.inventory_item_id ?? null,
    part_name: entry.part_name,
    qty: entry.qty,
    ...toCostValues(entry),
  }));

  const { error } = await supabase.from('work_order_parts').insert(rows);
  return { error };
}
