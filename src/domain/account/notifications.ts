import type { VDNotification } from '../../types/notification.js';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: VDNotification['type'];
  title: string;
  summary: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

export function notificationFromRow(row: NotificationRow): VDNotification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    summary: row.summary,
    content: row.content ?? undefined,
    metadata: row.metadata ?? undefined,
    isRead: row.is_read,
    createdAt: row.created_at,
    relatedEntityType: row.related_entity_type ?? undefined,
    relatedEntityId: row.related_entity_id ?? undefined,
  };
}

/** Read status is monotonic: a stale device must never turn a cloud-read item unread. */
export function mergeNotifications(local: readonly VDNotification[], cloud: readonly VDNotification[]): VDNotification[] {
  const merged = new Map<string, VDNotification>();
  for (const notification of local) merged.set(notification.id, notification);
  for (const notification of cloud) {
    const localCopy = merged.get(notification.id);
    merged.set(notification.id, localCopy ? { ...notification, isRead: localCopy.isRead || notification.isRead } : notification);
  }
  return [...merged.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id));
}

export function markNotificationRead(notifications: readonly VDNotification[], id: string): VDNotification[] {
  return notifications.map((notification) => notification.id === id ? { ...notification, isRead: true } : notification);
}
