import { AppNotification } from '@/shared/types';

export function createNotification(entry: Omit<AppNotification, 'id' | 'created_at' | 'read'>): AppNotification {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    read: false,
    ...entry,
  };
}

export function prependNotification(
  notifications: AppNotification[],
  entry: Omit<AppNotification, 'id' | 'created_at' | 'read'>,
  limit = 40,
): AppNotification[] {
  return [createNotification(entry), ...notifications].slice(0, limit);
}
