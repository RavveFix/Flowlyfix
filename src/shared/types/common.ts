export type OfflineMutationType =
  | 'UPDATE_WORK_ORDER'
  | 'ADD_WORK_LOG'
  | 'ADD_WORK_ORDER_PART'
  | 'SAVE_BILLABLE_DETAILS'
  | 'SET_BILLING_STATUS'
  | 'COMPLETE_FOR_BILLING';

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
