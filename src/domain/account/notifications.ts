import type { VDNotification } from '../../types/notification.js';
import { collectReviewRowPages, type ReviewRowPage } from '../review/pagination.js';

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

function sortNotificationRows<T extends Pick<NotificationRow, 'id' | 'created_at'>>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at) || right.id.localeCompare(left.id));
}

/**
 * A notification's created_at value is immutable, so offset pagination has a stable
 * primary order. Deduplication also protects the client if adjacent pages overlap.
 */
export function deduplicateAndSortNotificationRows(rows: readonly NotificationRow[]): NotificationRow[] {
  const unique = new Map<string, NotificationRow>();
  for (const row of rows) {
    const existing = unique.get(row.id);
    // Read state is monotonic even if an overlapping page was served from an older replica.
    unique.set(row.id, existing && (existing.is_read || row.is_read)
      ? { ...existing, is_read: true, read_at: existing.read_at ?? row.read_at }
      : (existing ?? row));
  }
  return sortNotificationRows([...unique.values()]);
}

/** Fetch every notification page; there is intentionally no client-side history cap. */
export async function collectNotificationRows(loadPage: (offset: number) => Promise<ReviewRowPage<NotificationRow>>): Promise<NotificationRow[]> {
  return deduplicateAndSortNotificationRows(await collectReviewRowPages(loadPage));
}

/** Read status is monotonic: a stale device must never turn a cloud-read item unread. */
export function mergeNotifications(local: readonly VDNotification[], cloud: readonly VDNotification[]): VDNotification[] {
  const merged = new Map<string, VDNotification>();
  for (const notification of local) merged.set(notification.id, notification);
  for (const notification of cloud) {
    const localCopy = merged.get(notification.id);
    merged.set(notification.id, localCopy ? { ...notification, isRead: localCopy.isRead || notification.isRead } : notification);
  }
  return [...merged.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id));
}

export function markNotificationRead(notifications: readonly VDNotification[], id: string): VDNotification[] {
  return notifications.map((notification) => notification.id === id ? { ...notification, isRead: true } : notification);
}

export interface NotificationReadReceipt { notificationId: string; readAt: string; }

/**
 * Local reads are optimistic, but a receipt leaves this queue only after the cloud
 * accepted an idempotent `is_read = true` PATCH. A retry can therefore never write
 * an unread value or permanently disappear after a transient failure.
 */
export class NotificationReadReceiptQueue {
  private readonly pendingById = new Map<string, NotificationReadReceipt>();

  enqueue(receipt: NotificationReadReceipt): void {
    if (!this.pendingById.has(receipt.notificationId)) this.pendingById.set(receipt.notificationId, receipt);
  }

  enqueueHydratedLocalReads(local: readonly VDNotification[], cloud: readonly VDNotification[], readAt: string): void {
    const cloudById = new Map(cloud.map((notification) => [notification.id, notification]));
    for (const notification of local) {
      const cloudCopy = cloudById.get(notification.id);
      if (notification.isRead && cloudCopy && !cloudCopy.isRead) this.enqueue({ notificationId: notification.id, readAt });
    }
  }

  pending(): NotificationReadReceipt[] { return [...this.pendingById.values()]; }

  acknowledge(receipt: NotificationReadReceipt): void {
    if (this.pendingById.get(receipt.notificationId)?.readAt === receipt.readAt) this.pendingById.delete(receipt.notificationId);
  }

  clear(): void { this.pendingById.clear(); }

  async flush(send: (receipt: NotificationReadReceipt) => Promise<void>): Promise<unknown[]> {
    const failures: unknown[] = [];
    for (const receipt of this.pending()) {
      try {
        await send(receipt);
        this.acknowledge(receipt);
      } catch (error) {
        failures.push(error);
      }
    }
    return failures;
  }
}
