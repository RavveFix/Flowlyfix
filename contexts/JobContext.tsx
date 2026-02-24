import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import {
  AppNotification,
  JobPriority,
  JobStatus,
  JobType,
  OfflineMutation,
  WorkOrder,
  WorkOrderPartLog,
  WorkOrderTimeLog,
} from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { countMutations, enqueueMutation, listMutations, removeMutation } from '../lib/offlineQueue';

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
    time_log: [{ description: 'Initial diagnos', minutes: 20 }],
    parts_used: [],
  },
];

function isNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /network|fetch|offline|timeout/i.test(message);
}

function nowIso() {
  return new Date().toISOString();
}

export const JobProvider = ({ children }: { children?: ReactNode }) => {
  const { profile, user, loading: authLoading } = useAuth();
  const organizationId = profile?.organization_id;
  const [jobs, setJobs] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const pushNotification = (entry: Omit<AppNotification, 'id' | 'created_at' | 'read'>) => {
    const notification: AppNotification = {
      id: crypto.randomUUID(),
      created_at: nowIso(),
      read: false,
      ...entry,
    };

    setNotifications((prev) => [notification, ...prev].slice(0, 40));
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
      supabase
        .from('work_logs')
        .select('id, work_order_id, description, minutes, created_at')
        .eq('organization_id', organizationId)
        .in('work_order_id', jobIds)
        .order('created_at', { ascending: true }),
      supabase
        .from('work_order_parts')
        .select('id, work_order_id, part_name, qty, total_cost, inventory_item_id, created_at')
        .eq('organization_id', organizationId)
        .in('work_order_id', jobIds)
        .order('created_at', { ascending: true }),
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

    let query = supabase
      .from('work_orders')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (profile?.role === 'TECHNICIAN') {
      query = query.eq('assigned_to_user_id', user?.id ?? '');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching jobs:', error.message);
      setLoading(false);
      return;
    }

    const normalized = ((data as any[]) ?? []).map(
      (raw): WorkOrder => ({
        ...raw,
        title: raw.title ?? raw.description,
      }),
    );

    const hydrated = await hydrateJobs(normalized);
    setJobs(hydrated);
    setLoading(false);
  };

  const queueMutationAndNotify = async (mutation: Omit<OfflineMutation, 'id' | 'created_at'>, label: string) => {
    await enqueueMutation(mutation);
    await refreshPendingMutations();
    pushNotification({
      type: 'warning',
      title: 'Offline mode',
      message: `${label} queued and will sync automatically.`,
    });
  };

  const applyMutationNow = async (mutation: Omit<OfflineMutation, 'id' | 'created_at'>) => {
    if (!supabase || !organizationId) return;

    switch (mutation.mutation_type) {
      case 'UPDATE_WORK_ORDER': {
        const updates = (mutation.payload.updates ?? {}) as Partial<WorkOrder>;
        const dbUpdates: Record<string, unknown> = {
          ...updates,
          updated_at: nowIso(),
        };
        delete dbUpdates.time_log;
        delete dbUpdates.parts_used;

        const { error } = await supabase
          .from('work_orders')
          .update(dbUpdates)
          .eq('id', mutation.work_order_id)
          .eq('organization_id', organizationId);

        if (error) {
          throw error;
        }
        break;
      }

      case 'ADD_WORK_LOG': {
        const entry = mutation.payload.entry as WorkOrderTimeLog;
        const { error } = await supabase.from('work_logs').insert({
          organization_id: organizationId,
          work_order_id: mutation.work_order_id,
          technician_id: user?.id,
          description: entry.description,
          minutes: entry.minutes,
        });

        if (error) {
          throw error;
        }
        break;
      }

      case 'ADD_WORK_ORDER_PART': {
        const part = mutation.payload.part as WorkOrderPartLog;
        const unitCost = Math.max(part.cost / Math.max(part.qty, 1), 0);

        const { error } = await supabase.from('work_order_parts').insert({
          organization_id: organizationId,
          work_order_id: mutation.work_order_id,
          inventory_item_id: part.inventory_item_id ?? null,
          part_name: part.part_name,
          qty: part.qty,
          unit_cost: Number(unitCost.toFixed(2)),
          total_cost: Number(part.cost.toFixed(2)),
        });

        if (error) {
          throw error;
        }
        break;
      }

      default:
        throw new Error(`Unsupported mutation type: ${mutation.mutation_type}`);
    }
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
            const { data: serverWorkOrder } = await supabase
              .from('work_orders')
              .select('status')
              .eq('id', mutation.work_order_id)
              .eq('organization_id', organizationId)
              .maybeSingle();

            if (serverWorkOrder?.status === JobStatus.DONE) {
              pushNotification({
                type: 'error',
                title: 'Sync conflict',
                message: `Work order ${mutation.work_order_id.slice(0, 8)} is already completed on server.`,
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
          title: 'Sync failed',
          message: 'Some offline changes could not be synchronized.',
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
        title: 'Offline mode',
        message: 'You are offline. Changes will be queued.',
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
              title: 'Work order updated',
              message: 'A work order was updated in real time.',
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
              title: 'New assignment',
              message: 'A technician assignment was updated.',
            });
          }

          if (eventType === 'WORK_ORDER_STATUS_CHANGED') {
            pushNotification({
              type: 'info',
              title: 'Status changed',
              message: 'A work order status changed.',
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
      priority: job.priority ?? JobPriority.NORMAL,
      job_type: job.job_type ?? JobType.FIELD,
      title: job.title ?? job.description ?? 'New work order',
      description: job.description ?? '',
      scheduled_start: job.scheduled_start ?? nowIso(),
      scheduled_end: job.scheduled_end ?? null,
      completed_at: job.completed_at ?? null,
      created_at: job.created_at ?? nowIso(),
      updated_at: nowIso(),
      contact_name: job.contact_name ?? null,
      contact_phone: job.contact_phone ?? null,
      contact_email: job.contact_email ?? null,
      time_log: job.time_log ?? [],
      parts_used: job.parts_used ?? [],
    };

    if (!supabase || !organizationId) {
      setJobs((prev) => [newWorkOrder, ...prev]);
      return newWorkOrder;
    }

    const { data, error } = await supabase
      .from('work_orders')
      .insert({
        organization_id: organizationId,
        customer_id: newWorkOrder.customer_id,
        asset_id: newWorkOrder.asset_id,
        assigned_to_user_id: newWorkOrder.assigned_to_user_id,
        job_type: newWorkOrder.job_type,
        status: newWorkOrder.status,
        priority: newWorkOrder.priority,
        title: newWorkOrder.title,
        description: newWorkOrder.description,
        scheduled_start: newWorkOrder.scheduled_start,
        scheduled_end: newWorkOrder.scheduled_end,
        contact_name: newWorkOrder.contact_name,
        contact_phone: newWorkOrder.contact_phone,
        contact_email: newWorkOrder.contact_email,
      })
      .select('*')
      .single();

    if (error) {
      console.error('addJob failed:', error.message);
      pushNotification({
        type: 'error',
        title: 'Create failed',
        message: 'Could not create work order.',
      });
      return null;
    }

    const created = data as WorkOrder;
    setJobs((prev) => [{ ...created, time_log: [], parts_used: [] }, ...prev]);
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
      await queueMutationAndNotify(mutation, 'Work order update');
      return;
    }

    try {
      await applyMutationNow(mutation);
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation, 'Work order update');
      } else {
        console.error('updateJob failed:', error);
        pushNotification({
          type: 'error',
          title: 'Update failed',
          message: 'Could not update work order.',
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
      await queueMutationAndNotify(mutation, 'Work log');
      return;
    }

    try {
      await applyMutationNow(mutation);
      await fetchJobs();
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation, 'Work log');
      } else {
        console.error('addWorkLog failed:', error);
        pushNotification({
          type: 'error',
          title: 'Log failed',
          message: 'Could not add work log entry.',
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
      await queueMutationAndNotify(mutation, 'Part usage');
      return;
    }

    try {
      await applyMutationNow(mutation);
      await fetchJobs();
    } catch (error) {
      if (isNetworkError(error)) {
        await queueMutationAndNotify(mutation, 'Part usage');
      } else {
        console.error('addWorkPart failed:', error);
        pushNotification({
          type: 'error',
          title: 'Part log failed',
          message: 'Could not add part usage.',
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
