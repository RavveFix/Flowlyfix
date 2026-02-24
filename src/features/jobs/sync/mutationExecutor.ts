import {
  BillingStatus,
  CompleteForBillingPayload,
  JobStatus,
  OfflineMutation,
  SaveBillableDetailsPayload,
  WorkOrder,
  WorkOrderPartLog,
  WorkOrderTimeLog,
} from '@/shared/types';
import {
  fetchWorkOrderStatus,
  updateWorkOrderRow,
} from '@/features/jobs/api/workOrdersRepo';
import { addWorkLogRow, replaceWorkLogsForOrder } from '@/features/jobs/api/workLogsRepo';
import { addWorkPartRow, replaceWorkPartsForOrder } from '@/features/jobs/api/workPartsRepo';

export function nowIso() {
  return new Date().toISOString();
}

export function cleanTimeLogEntries(entries: WorkOrderTimeLog[]) {
  return entries.filter((entry) => entry.description.trim() !== '' || Number(entry.minutes) > 0);
}

export function cleanPartEntries(entries: WorkOrderPartLog[]) {
  return entries.filter((entry) => entry.part_name.trim() !== '' && Number(entry.qty) > 0);
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }

  return String(error);
}

export function isNetworkError(error: unknown) {
  const message = getErrorMessage(error);
  return /network|fetch|offline|timeout/i.test(message);
}

export function isBillingGuardError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return /billing|transition|report|signature|work log|part row|admin|done/.test(message);
}

interface ApplyMutationInput {
  mutation: Omit<OfflineMutation, 'id' | 'created_at'>;
  organizationId: string;
  userId?: string;
}

export async function applyMutationNow({ mutation, organizationId, userId }: ApplyMutationInput) {
  switch (mutation.mutation_type) {
    case 'UPDATE_WORK_ORDER': {
      const updates = (mutation.payload.updates ?? {}) as Partial<WorkOrder>;
      const dbUpdates: Record<string, unknown> = {
        ...updates,
        updated_at: nowIso(),
      };
      delete dbUpdates.time_log;
      delete dbUpdates.parts_used;

      const { error } = await updateWorkOrderRow({
        organizationId,
        workOrderId: mutation.work_order_id,
        updates: dbUpdates,
      });
      if (error) throw error;
      break;
    }

    case 'ADD_WORK_LOG': {
      const entry = mutation.payload.entry as WorkOrderTimeLog;
      const { error } = await addWorkLogRow({
        organizationId,
        workOrderId: mutation.work_order_id,
        technicianId: userId,
        entry,
      });
      if (error) throw error;
      break;
    }

    case 'ADD_WORK_ORDER_PART': {
      const part = mutation.payload.part as WorkOrderPartLog;
      const { error } = await addWorkPartRow({
        organizationId,
        workOrderId: mutation.work_order_id,
        part,
      });
      if (error) throw error;
      break;
    }

    case 'SAVE_BILLABLE_DETAILS': {
      if (!userId) {
        throw new Error('Authenticated user is required to update billable details.');
      }

      const payload = mutation.payload as unknown as SaveBillableDetailsPayload;
      const report = payload.report.trim();
      const timeLog = cleanTimeLogEntries(payload.time_log ?? []);
      const partLog = cleanPartEntries(payload.parts_used ?? []);

      const { error: orderError } = await updateWorkOrderRow({
        organizationId,
        workOrderId: mutation.work_order_id,
        updates: {
          technician_report: report,
          updated_at: nowIso(),
        },
      });
      if (orderError) throw orderError;

      const { error: logsError } = await replaceWorkLogsForOrder({
        organizationId,
        workOrderId: mutation.work_order_id,
        technicianId: userId,
        entries: timeLog,
      });
      if (logsError) throw logsError;

      const { error: partsError } = await replaceWorkPartsForOrder({
        organizationId,
        workOrderId: mutation.work_order_id,
        entries: partLog,
      });
      if (partsError) throw partsError;
      break;
    }

    case 'SET_BILLING_STATUS': {
      const payload = mutation.payload as { status: BillingStatus };
      const nextStatus = payload.status;
      const changedAt = nowIso();
      const updates: Record<string, unknown> = {
        billing_status: nextStatus,
        updated_at: changedAt,
      };

      if (nextStatus === BillingStatus.READY) {
        updates.billing_sent_at = null;
        updates.billing_sent_by = null;
      }

      if (nextStatus === BillingStatus.SENT) {
        updates.billing_sent_at = changedAt;
        updates.billing_sent_by = userId ?? null;
      }

      if (nextStatus === BillingStatus.INVOICED) {
        updates.invoiced_at = changedAt;
        updates.invoiced_by = userId ?? null;
      }

      const { error } = await updateWorkOrderRow({
        organizationId,
        workOrderId: mutation.work_order_id,
        updates,
      });
      if (error) throw error;
      break;
    }

    case 'COMPLETE_FOR_BILLING': {
      const payload = mutation.payload as unknown as CompleteForBillingPayload;
      const completionTime = nowIso();
      const { error } = await updateWorkOrderRow({
        organizationId,
        workOrderId: mutation.work_order_id,
        updates: {
          status: JobStatus.DONE,
          completed_at: completionTime,
          technician_report: payload.report.trim(),
          technician_signed_by: userId ?? null,
          technician_signed_name: payload.signedName.trim(),
          technician_signed_at: completionTime,
          billing_status: BillingStatus.READY,
          billing_ready_at: completionTime,
          updated_at: completionTime,
        },
      });
      if (error) throw error;
      break;
    }

    default:
      throw new Error(`Unsupported mutation type: ${mutation.mutation_type}`);
  }
}

export async function fetchServerWorkOrderStatus(input: { organizationId: string; workOrderId: string }) {
  const { data, error } = await fetchWorkOrderStatus(input);
  if (error) {
    throw error;
  }
  return data?.status as JobStatus | undefined;
}
