import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  AppNotification,
  BillingStatus,
  CompleteForBillingPayload,
  JobPriority,
  JobStatus,
  JobType,
  OfflineMutation,
  SaveBillableDetailsPayload,
  WorkOrder,
  WorkOrderPartLog,
  WorkOrderTimeLog,
} from '@/shared/types';
import { supabase, isSupabaseConfigured } from '@/shared/lib/supabase/client';
import { useAuth } from '@/features/auth/state/AuthContext';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { countMutations, enqueueMutation, listMutations, removeMutation } from '@/features/jobs/sync/mutationQueue';
import { fetchWorkOrdersByOrganization, insertWorkOrderRow } from '@/features/jobs/api/workOrdersRepo';
import { fetchWorkLogsByOrderIds } from '@/features/jobs/api/workLogsRepo';
import { fetchWorkPartsByOrderIds } from '@/features/jobs/api/workPartsRepo';
import {
  applyMutationNow as executeMutationNow,
  cleanPartEntries,
  cleanTimeLogEntries,
  fetchServerWorkOrderStatus,
  isBillingGuardError,
  isNetworkError,
  nowIso,
} from '@/features/jobs/sync/mutationExecutor';
import { prependNotification } from '@/features/jobs/state/notifications';

interface JobContextType {
  jobs: WorkOrder[];
  loading: boolean;
  isOffline: boolean;
  pendingMutations: number;
  notifications: AppNotification[];
  addJob: (job: Partial<WorkOrder>) => Promise<WorkOrder | null>;
  updateJob: (jobId: string, updates: Partial<WorkOrder>) => Promise<void>;
  addWorkLog: (workOrderId: string, entry: WorkOrderTimeLog) => Promise<void>;
  addWorkPart: (workOrderId: string, part: WorkOrderPartLog) => Promise<void>;
  completeForBilling: (workOrderId: string, payload: CompleteForBillingPayload) => Promise<void>;
  saveBillableDetails: (workOrderId: string, payload: SaveBillableDetailsPayload) => Promise<void>;
  setBillingStatus: (workOrderId: string, status: BillingStatus) => Promise<void>;
  getJobById: (jobId: string) => WorkOrder | undefined;
  syncPendingMutations: () => Promise<void>;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
}

const JobContext = createContext<JobContextType | undefined>(undefined);

const DEMO_JOBS: WorkOrder[] = [
  {
    id: 'demo-wo-1',
    organization_id: 'demo-org',
    customer_id: 'demo-customer-1',
    asset_id: 'demo-asset-1',
    assigned_to_user_id: 'demo-tech-1',
    status: JobStatus.OPEN,
    billing_status: BillingStatus.NONE,
    priority: JobPriority.HIGH,
    job_type: JobType.FIELD,
    title: 'Årlig service',
    description: 'Kaffemaskinen läcker vatten vid ångmunstycket.',
    scheduled_start: new Date().toISOString(),
    scheduled_end: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contact_name: 'Anna Berg',
    contact_phone: '+46 70 111 22 33',
    contact_email: 'anna@nordiccoffee.se',
    technician_report: null,
    technician_signed_by: null,
    technician_signed_name: null,
    technician_signed_at: null,
    billing_ready_at: null,
    billing_sent_at: null,
    billing_sent_by: null,
    invoiced_at: null,
    invoiced_by: null,
    time_log: [],
    parts_used: [],
  },
  {
    id: 'demo-wo-2',
    organization_id: 'demo-org',
    customer_id: 'demo-customer-2',
    asset_id: 'demo-asset-2',
    assigned_to_user_id: 'demo-tech-2',
    status: JobStatus.WORKSHOP_RECEIVED,
    billing_status: BillingStatus.NONE,
    priority: JobPriority.NORMAL,
    job_type: JobType.WORKSHOP,
    title: 'Workshop felsökning',
    description: 'Maskinen startar inte efter strömavbrott.',
    scheduled_start: new Date().toISOString(),
    scheduled_end: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    contact_name: null,
    contact_phone: null,
    contact_email: null,
    technician_report: null,
    technician_signed_by: null,
    technician_signed_name: null,
    technician_signed_at: null,
    billing_ready_at: null,
    billing_sent_at: null,
    billing_sent_by: null,
    invoiced_at: null,
    invoiced_by: null,
    time_log: [{ description: 'Initial diagnos', minutes: 20 }],
    parts_used: [],
  },
];

export const JobProvider = ({ children }: { children?: ReactNode }) => {
  const { profile, user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const organizationId = profile?.organization_id;
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const pushNotification = (entry: Omit<AppNotification, 'id' | 'created_at' | 'read'>) => {
    setNotifications((prev) => prependNotification(prev, entry));
  };

  const refreshPendingMutations = async () => {
    const count = await countMutations();
    setPendingMutations(count);
  };

  const hydrateJobs = async (baseJobs: WorkOrder[]) => {
    if (!supabase || !organizationId || baseJobs.length === 0) {
      return baseJobs;
    }

    const jobIds = baseJobs.map((job) => job.id);

    const [logsRes, partsRes] = await Promise.all([
      fetchWorkLogsByOrderIds({ organizationId, jobIds }),
      fetchWorkPartsByOrderIds({ organizationId, jobIds }),
    ]);

    if (logsRes.error) {
      console.error('work_logs hydrate error:', logsRes.error.message);
    }

    if (partsRes.error) {
      console.error('work_order_parts hydrate error:', partsRes.error.message);
    }

    const logsByOrder = new Map<string, WorkOrderTimeLog[]>();
    const partsByOrder = new Map<string, WorkOrderPartLog[]>();

    (logsRes.data ?? []).forEach((log: any) => {
      const current = logsByOrder.get(log.work_order_id) ?? [];
      current.push({
        id: log.id,
        description: log.description,
        minutes: Number(log.minutes ?? 0),
        created_at: log.created_at,
      });
      logsByOrder.set(log.work_order_id, current);
    });

    (partsRes.data ?? []).forEach((part: any) => {
      const current = partsByOrder.get(part.work_order_id) ?? [];
      current.push({
        id: part.id,
        part_name: part.part_name,
        qty: Number(part.qty ?? 0),
        cost: Number(part.total_cost ?? 0),
        inventory_item_id: part.inventory_item_id,
      });
      partsByOrder.set(part.work_order_id, current);
    });

    return baseJobs.map((job) => ({
      ...job,
      time_log: logsByOrder.get(job.id) ?? [],
      parts_used: partsByOrder.get(job.id) ?? [],
    }));
  };

  const fetchJobs = async () => {
    if (authLoading) return;

    if (!supabase || !isSupabaseConfigured || !organizationId) {
      setJobs(DEMO_JOBS);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await fetchWorkOrdersByOrganization({
      organizationId,
      role: profile?.role,
      userId: user?.id ?? undefined,
    });

    if (error) {
      console.error('Error fetching jobs:', error.message);
      setLoading(false);
      return;
    }

    const hydrated = await hydrateJobs(data ?? []);
    setJobs(hydrated);
    setLoading(false);
  };

  const queueMutationAndNotify = async (mutation: Omit<OfflineMutation, 'id' | 'created_at'>) => {
    await enqueueMutation(mutation);
    await refreshPendingMutations();
    pushNotification({
      type: 'warning',
      title: t('notif.offline_mode_title'),
      message: t('notif.offline_change_queued'),
    });
  };

  const applyMutationNow = async (mutation: Omit<OfflineMutation, 'id' | 'created_at'>) => {
    if (!organizationId) return;
    await executeMutationNow({
      mutation,
      organizationId,
      userId: user?.id ?? undefined,
    });
  };

  const syncPendingMutations = async () => {
    if (!supabase || !organizationId || isOffline) return;

    const queued = (await listMutations()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (queued.length === 0) {
      await refreshPendingMutations();
      return;
    }

    for (const mutation of queued) {
      try {
        if (mutation.mutation_type === 'UPDATE_WORK_ORDER') {
          const queuedUpdates = (mutation.payload.updates ?? {}) as Partial<WorkOrder>;
          if (queuedUpdates.status && queuedUpdates.status !== JobStatus.DONE) {
            const serverStatus = await fetchServerWorkOrderStatus({
              organizationId,
              workOrderId: mutation.work_order_id,
            });

            if (serverStatus === JobStatus.DONE) {
              pushNotification({
                type: 'error',
                title: t('notif.sync_conflict_title'),
                message: t('notif.sync_conflict_message'),
              });
              await removeMutation(mutation.id);
              continue;
            }
          }
        }

        await applyMutationNow(mutation);
        await removeMutation(mutation.id);
      } catch (error) {
        console.error('Failed to sync mutation', mutation.id, error);
        pushNotification({
          type: 'error',
          title: t('notif.sync_failed_title'),
          message: t('notif.sync_failed_message'),
        });
        break;
      }
    }

    await refreshPendingMutations();
    await fetchJobs();
  };

  useEffect(() => {
    fetchJobs().catch((error) => {
      console.error('fetchJobs failed:', error);
      setLoading(false);
    });

    refreshPendingMutations().catch((error) => {
      console.error('refreshPendingMutations failed:', error);
    });
  }, [organizationId, authLoading, profile?.role, user?.id]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      syncPendingMutations().catch((error) => {
        console.error('syncPendingMutations failed after reconnect:', error);
      });
    };

    const handleOffline = () => {
      setIsOffline(true);
      pushNotification({
        type: 'warning',
        title: t('notif.offline_mode_title'),
        message: t('notif.offline_mode_message'),
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [organizationId]);

  useEffect(() => {
    if (!supabase || !organizationId) {
      return;
    }

    const channel = supabase
      .channel(`jobs-${organizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders', filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          fetchJobs().catch((error) => console.error('realtime fetch jobs failed:', error));

          if (payload.eventType === 'UPDATE') {
            pushNotification({
              type: 'info',
              title: t('notif.work_order_updated_title'),
              message: t('notif.work_order_updated_message'),
            });
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'work_order_events', filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const event = payload.new as any;
          const eventType = event.event_type as string;

          if (eventType === 'WORK_ORDER_ASSIGNED') {
            pushNotification({
              type: 'success',
              title: t('notif.new_assignment_title'),
              message: t('notif.new_assignment_message'),
            });
          }

          if (eventType === 'WORK_ORDER_STATUS_CHANGED') {
            pushNotification({
              type: 'info',
              title: t('notif.status_changed_title'),
              message: t('notif.status_changed_message'),
            });
          }

          if (eventType === 'WORK_ORDER_BILLING_READY') {
            pushNotification({
              type: 'success',
              title: t('notif.billing_ready_title'),
              message: t('notif.billing_ready_message'),
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, profile?.role]);

  const addJob = async (job: Partial<WorkOrder>) => {
    const newWorkOrder: WorkOrder = {
      id: job.id ?? crypto.randomUUID(),
      organization_id: organizationId ?? 'demo-org',
      customer_id: job.customer_id ?? '',
      asset_id: job.asset_id ?? null,
      assigned_to_user_id: job.assigned_to_user_id ?? null,
      status: job.status ?? JobStatus.OPEN,
      billing_status: job.billing_status ?? BillingStatus.NONE,
      priority: job.priority ?? JobPriority.NORMAL,
      job_type: job.job_type ?? JobType.FIELD,
      title: job.title ?? job.description ?? t('jobs.new_work_order'),
      description: job.description ?? '',
      scheduled_start: job.scheduled_start ?? nowIso(),
      scheduled_end: job.scheduled_end ?? null,
      completed_at: job.completed_at ?? null,
      created_at: job.created_at ?? nowIso(),
      updated_at: nowIso(),
      contact_name: job.contact_name ?? null,
      contact_phone: job.contact_phone ?? null,
      contact_email: job.contact_email ?? null,
      technician_report: job.technician_report ?? null,
      technician_signed_by: job.technician_signed_by ?? null,
      technician_signed_name: job.technician_signed_name ?? null,
      technician_signed_at: job.technician_signed_at ?? null,
      billing_ready_at: job.billing_ready_at ?? null,
      billing_sent_at: job.billing_sent_at ?? null,
      billing_sent_by: job.billing_sent_by ?? null,
      invoiced_at: job.invoiced_at ?? null,
      invoiced_by: job.invoiced_by ?? null,
      time_log: job.time_log ?? [],
      parts_used: job.parts_used ?? [],
    };

    if (!supabase || !organizationId) {
      setJobs((prev) => [newWorkOrder, ...prev]);
      return newWorkOrder;
    }

    const { data, error } = await insertWorkOrderRow({
      organizationId,
      payload: {
        customer_id: newWorkOrder.customer_id,
        asset_id: newWorkOrder.asset_id,
        assigned_to_user_id: newWorkOrder.assigned_to_user_id,
        job_type: newWorkOrder.job_type,
        status: newWorkOrder.status,
        billing_status: newWorkOrder.billing_status,
        priority: newWorkOrder.priority,
        title: newWorkOrder.title,
        description: newWorkOrder.description,
        scheduled_start: newWorkOrder.scheduled_start,
        scheduled_end: newWorkOrder.scheduled_end,
        contact_name: newWorkOrder.contact_name,
        contact_phone: newWorkOrder.contact_phone,
        contact_email: newWorkOrder.contact_email,
        technician_report: newWorkOrder.technician_report,
      },
    });

    if (error) {
      console.error('addJob failed:', error.message);
      pushNotification({
        type: 'error',
        title: t('notif.create_failed_title'),
        message: t('notif.create_failed_message'),
      });
      return null;
    }

    const created = data as WorkOrder;
    setJobs((prev) => [
      {
        ...created,
        billing_status: created.billing_status ?? BillingStatus.NONE,
        technician_report: created.technician_report ?? null,
        technician_signed_by: created.technician_signed_by ?? null,
        technician_signed_name: created.technician_signed_name ?? null,
        technician_signed_at: created.technician_signed_at ?? null,
        billing_ready_at: created.billing_ready_at ?? null,
        billing_sent_at: created.billing_sent_at ?? null,
        billing_sent_by: created.billing_sent_by ?? null,
        invoiced_at: created.invoiced_at ?? null,
        invoiced_by: created.invoiced_by ?? null,
        time_log: [],
        parts_used: [],
      },
      ...prev,
    ]);
    return created;
  };

  const updateJob = async (jobId: string, updates: Partial<WorkOrder>) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === jobId
          ? {
              ...job,
              ...updates,
              updated_at: nowIso(),
            }
          : job,
      ),
    );

    const mutation: Omit<OfflineMutation, 'id' | 'created_at'> = {
      organization_id: organizationId ?? 'demo-org',
      work_order_id: jobId,
      mutation_type: 'UPDATE_WORK_ORDER',
      payload: {
        updates,
      },
    };

    if (!supabase || !organizationId || isOffline) {
      await queueMutationAndNotify(mutation);
      return;
    }

    try {
      await applyMutationNow(mutation);
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation);
      } else {
        console.error('updateJob failed:', error);
        pushNotification({
          type: 'error',
          title: t('notif.update_failed_title'),
          message: t('notif.update_failed_message'),
        });
      }
    }
  };

  const completeForBilling = async (workOrderId: string, payload: CompleteForBillingPayload) => {
    const targetJob = jobs.find((job) => job.id === workOrderId);
    if (!targetJob) {
      return;
    }

    const report = payload.report.trim();
    const signedName = payload.signedName.trim() || profile?.full_name || user?.email || t('common.unknown');
    const hasTimeLog = (targetJob.time_log?.length ?? 0) > 0;
    const hasPartLog = (targetJob.parts_used?.length ?? 0) > 0;

    if (!report || !hasTimeLog || !hasPartLog) {
      pushNotification({
        type: 'error',
        title: t('notif.billing_validation_failed_title'),
        message: t('notif.billing_validation_failed_message'),
      });
      return;
    }

    const completionTime = nowIso();
    const optimisticUpdates: Partial<WorkOrder> = {
      status: JobStatus.DONE,
      completed_at: completionTime,
      technician_report: report,
      technician_signed_by: user?.id ?? null,
      technician_signed_name: signedName,
      technician_signed_at: completionTime,
      billing_status: BillingStatus.READY,
      billing_ready_at: completionTime,
    };

    setJobs((prev) =>
      prev.map((job) =>
        job.id === workOrderId
          ? {
              ...job,
              ...optimisticUpdates,
              updated_at: completionTime,
            }
          : job,
      ),
    );

    const mutation: Omit<OfflineMutation, 'id' | 'created_at'> = {
      organization_id: organizationId ?? 'demo-org',
      work_order_id: workOrderId,
      mutation_type: 'COMPLETE_FOR_BILLING',
      payload: {
        report,
        signedName,
      },
    };

    if (!supabase || !organizationId || isOffline) {
      await queueMutationAndNotify(mutation);
      return;
    }

    try {
      await applyMutationNow(mutation);
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation);
      } else {
        console.error('completeForBilling failed:', error);
        pushNotification({
          type: 'error',
          title: t('notif.update_failed_title'),
          message: t('notif.update_failed_message'),
        });
      }
    }
  };

  const saveBillableDetails = async (workOrderId: string, payload: SaveBillableDetailsPayload) => {
    const targetJob = jobs.find((job) => job.id === workOrderId);
    if (!targetJob) {
      return;
    }

    if (targetJob.billing_status !== BillingStatus.READY) {
      pushNotification({
        type: 'warning',
        title: t('notif.billing_locked_title'),
        message: t('notif.billing_locked_message'),
      });
      return;
    }

    const report = payload.report.trim();
    const timeLog = cleanTimeLogEntries(payload.time_log ?? []);
    const partLog = cleanPartEntries(payload.parts_used ?? []);

    setJobs((prev) =>
      prev.map((job) =>
        job.id === workOrderId
          ? {
              ...job,
              technician_report: report,
              time_log: timeLog,
              parts_used: partLog,
              updated_at: nowIso(),
            }
          : job,
      ),
    );

    const mutation: Omit<OfflineMutation, 'id' | 'created_at'> = {
      organization_id: organizationId ?? 'demo-org',
      work_order_id: workOrderId,
      mutation_type: 'SAVE_BILLABLE_DETAILS',
      payload: {
        report,
        time_log: timeLog,
        parts_used: partLog,
      },
    };

    if (!supabase || !organizationId || isOffline) {
      await queueMutationAndNotify(mutation);
      return;
    }

    try {
      await applyMutationNow(mutation);
      await fetchJobs();
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation);
      } else {
        console.error('saveBillableDetails failed:', error);
        pushNotification({
          type: 'error',
          title: t('notif.update_failed_title'),
          message: t('notif.update_failed_message'),
        });
      }
    }
  };

  const setBillingStatus = async (workOrderId: string, status: BillingStatus) => {
    const targetJob = jobs.find((job) => job.id === workOrderId);
    if (!targetJob) {
      return;
    }

    const validTransition =
      (targetJob.billing_status === BillingStatus.READY && status === BillingStatus.SENT) ||
      (targetJob.billing_status === BillingStatus.SENT && status === BillingStatus.READY) ||
      (targetJob.billing_status === BillingStatus.SENT && status === BillingStatus.INVOICED);
    const isReopenTransition = targetJob.billing_status === BillingStatus.SENT && status === BillingStatus.READY;

    if (!validTransition) {
      pushNotification({
        type: 'warning',
        title: t('notif.billing_transition_invalid_title'),
        message: t('notif.billing_transition_invalid_message'),
      });
      return;
    }

    const timestamp = nowIso();
    const optimisticUpdates: Partial<WorkOrder> = {
      billing_status: status,
    };

    if (status === BillingStatus.SENT) {
      optimisticUpdates.billing_sent_at = timestamp;
      optimisticUpdates.billing_sent_by = user?.id ?? null;
    }

    if (status === BillingStatus.READY) {
      optimisticUpdates.billing_sent_at = null;
      optimisticUpdates.billing_sent_by = null;
    }

    if (status === BillingStatus.INVOICED) {
      optimisticUpdates.invoiced_at = timestamp;
      optimisticUpdates.invoiced_by = user?.id ?? null;
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === workOrderId
          ? {
              ...job,
              ...optimisticUpdates,
              updated_at: timestamp,
            }
          : job,
      ),
    );

    const mutation: Omit<OfflineMutation, 'id' | 'created_at'> = {
      organization_id: organizationId ?? 'demo-org',
      work_order_id: workOrderId,
      mutation_type: 'SET_BILLING_STATUS',
      payload: {
        status,
      },
    };

    if (!supabase || !organizationId || isOffline) {
      await queueMutationAndNotify(mutation);
      return;
    }

    try {
      await applyMutationNow(mutation);
      if (isReopenTransition) {
        pushNotification({
          type: 'success',
          title: t('notif.billing_reopened_title'),
          message: t('notif.billing_reopened_message'),
        });
      }
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation);
      } else {
        console.error('setBillingStatus failed:', error);
        await fetchJobs();
        const messageKey = isBillingGuardError(error) ? 'notif.billing_guard_failed' : 'notif.update_failed_message';
        pushNotification({
          type: isBillingGuardError(error) ? 'warning' : 'error',
          title: isBillingGuardError(error) ? t('notif.billing_transition_invalid_title') : t('notif.update_failed_title'),
          message: t(messageKey),
        });
      }
    }
  };

  const addWorkLog = async (workOrderId: string, entry: WorkOrderTimeLog) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === workOrderId
          ? {
              ...job,
              time_log: [...(job.time_log ?? []), { ...entry, created_at: nowIso() }],
            }
          : job,
      ),
    );

    const mutation: Omit<OfflineMutation, 'id' | 'created_at'> = {
      organization_id: organizationId ?? 'demo-org',
      work_order_id: workOrderId,
      mutation_type: 'ADD_WORK_LOG',
      payload: {
        entry,
      },
    };

    if (!supabase || !organizationId || isOffline) {
      await queueMutationAndNotify(mutation);
      return;
    }

    try {
      await applyMutationNow(mutation);
      await fetchJobs();
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation);
      } else {
        console.error('addWorkLog failed:', error);
        pushNotification({
          type: 'error',
          title: t('notif.log_failed_title'),
          message: t('notif.log_failed_message'),
        });
      }
    }
  };

  const addWorkPart = async (workOrderId: string, part: WorkOrderPartLog) => {
    setJobs((prev) =>
      prev.map((job) =>
        job.id === workOrderId
          ? {
              ...job,
              parts_used: [...(job.parts_used ?? []), part],
            }
          : job,
      ),
    );

    const mutation: Omit<OfflineMutation, 'id' | 'created_at'> = {
      organization_id: organizationId ?? 'demo-org',
      work_order_id: workOrderId,
      mutation_type: 'ADD_WORK_ORDER_PART',
      payload: {
        part,
      },
    };

    if (!supabase || !organizationId || isOffline) {
      await queueMutationAndNotify(mutation);
      return;
    }

    try {
      await applyMutationNow(mutation);
      await fetchJobs();
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation);
      } else {
        console.error('addWorkPart failed:', error);
        pushNotification({
          type: 'error',
          title: t('notif.part_log_failed_title'),
          message: t('notif.part_log_failed_message'),
        });
      }
    }
  };

  const getJobById = (jobId: string) => jobs.find((job) => job.id === jobId);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const value = useMemo<JobContextType>(
    () => ({
      jobs,
      loading,
      isOffline,
      pendingMutations,
      notifications,
      addJob,
      updateJob,
      addWorkLog,
      addWorkPart,
      completeForBilling,
      saveBillableDetails,
      setBillingStatus,
      getJobById,
      syncPendingMutations,
      dismissNotification,
      clearNotifications,
    }),
    [jobs, loading, isOffline, pendingMutations, notifications, organizationId],
  );

  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
};

export const useJobs = () => {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error('useJobs must be used within a JobProvider');
  }
  return context;
};
