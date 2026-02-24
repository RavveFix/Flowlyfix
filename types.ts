export enum UserRole {
  ADMIN = 'ADMIN',
  TECHNICIAN = 'TECHNICIAN',
}

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

export enum JobPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface Organization {
  id: string;
  name: string;
  org_number?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TechnicianProfile extends Profile {
  role: UserRole.TECHNICIAN;
}

export interface Customer {
  id: string;
  organization_id: string;
  name: string;
  org_number?: string | null;
  external_fortnox_id?: string | null;
  address: string;
  contact_person?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerSite {
  id: string;
  organization_id: string;
  customer_id: string;
  name: string;
  address: string;
  contact_person?: string | null;
  contact_phone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  organization_id: string;
  customer_id: string;
  customer_site_id?: string | null;
  name: string;
  serial_number: string;
  model: string;
  location_in_building?: string | null;
  qr_code_id?: string | null;
  install_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  organization_id: string;
  sku: string;
  name: string;
  stock_qty: number;
  unit_cost: number;
  created_at: string;
  updated_at: string;
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

export type OfflineMutationType =
  | 'UPDATE_WORK_ORDER'
  | 'ADD_WORK_LOG'
  | 'ADD_WORK_ORDER_PART';

export interface OfflineMutation {
  id: string;
  organization_id: string;
  work_order_id: string;
  mutation_type: OfflineMutationType;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  created_at: string;
  read: boolean;
}

export interface CsvImportRow {
  customer_name: string;
  customer_org_number?: string;
  customer_address?: string;
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  asset_name?: string;
  asset_model?: string;
  asset_serial_number?: string;
  asset_location?: string;
}

export interface CsvImportResult {
  created: number;
  updated: number;
  failed: Array<{ row: number; error: string }>;
}
