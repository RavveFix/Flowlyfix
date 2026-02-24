export enum JobType {
  FIELD = 'FIELD',
  WORKSHOP = 'WORKSHOP',
}

export enum JobStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  TRAVELING = 'TRAVELING',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
  CANCELED = 'CANCELED',
  WORKSHOP_RECEIVED = 'WORKSHOP_RECEIVED',
  WORKSHOP_TROUBLESHOOTING = 'WORKSHOP_TROUBLESHOOTING',
  WORKSHOP_WAITING_PARTS = 'WORKSHOP_WAITING_PARTS',
  WORKSHOP_READY = 'WORKSHOP_READY',
  WEB_PENDING = 'WEB_PENDING',
}

export enum BillingStatus {
  NONE = 'NONE',
  READY = 'READY',
  SENT = 'SENT',
  INVOICED = 'INVOICED',
}

export enum JobPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface WorkLogEntry {
  id: string;
  organization_id: string;
  work_order_id: string;
  technician_id: string;
  description: string;
  minutes: number;
  created_at: string;
}

export interface WorkOrderPart {
  id: string;
  organization_id: string;
  work_order_id: string;
  inventory_item_id?: string | null;
  part_name: string;
  sku?: string | null;
  qty: number;
  unit_cost: number;
  total_cost: number;
  created_at: string;
}

export interface WorkOrderEvent {
  id: string;
  organization_id: string;
  work_order_id: string;
  actor_user_id?: string | null;
  event_type: string;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface WorkOrderTimeLog {
  id?: string;
  description: string;
  minutes: number;
  created_at?: string;
}

export interface WorkOrderPartLog {
  id?: string;
  part_name: string;
  qty: number;
  cost: number;
  inventory_item_id?: string;
}

export interface WorkOrder {
  id: string;
  organization_id: string;
  customer_id: string;
  asset_id?: string | null;
  assigned_to_user_id?: string | null;
  status: JobStatus;
  billing_status: BillingStatus;
  priority: JobPriority;
  job_type: JobType;
  title: string;
  description: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  technician_report?: string | null;
  technician_signed_by?: string | null;
  technician_signed_name?: string | null;
  technician_signed_at?: string | null;
  billing_ready_at?: string | null;
  billing_sent_at?: string | null;
  billing_sent_by?: string | null;
  invoiced_at?: string | null;
  invoiced_by?: string | null;
  time_log?: WorkOrderTimeLog[];
  parts_used?: WorkOrderPartLog[];
}

export interface CreateWorkOrderInput {
  customer_id: string;
  asset_id?: string;
  assigned_to_user_id?: string;
  status?: JobStatus;
  priority?: JobPriority;
  job_type: JobType;
  title?: string;
  description: string;
  scheduled_start?: string;
  scheduled_end?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
}

export interface CreateJobInput {
  customerId: string;
  assetId?: string;
  description: string;
  priority: JobPriority;
  assignedTechnicianId?: string;
  jobType?: JobType;
  title?: string;
}

export interface CompleteForBillingPayload {
  report: string;
  signedName: string;
}

export interface SaveBillableDetailsPayload {
  report: string;
  time_log: WorkOrderTimeLog[];
  parts_used: WorkOrderPartLog[];
}
