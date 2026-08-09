export const notificationTypes = ['SYSTEM', 'WEEKLY_REPORT', 'AI_ANALYSIS', 'RISK_WARNING', 'ACHIEVEMENT', 'GOAL', 'TASK', 'SOCIAL'] as const;
export type NotificationType = typeof notificationTypes[number];
export interface VDNotification { id: string; userId?: string; type: NotificationType; title: string; summary: string; content?: string; metadata?: Record<string, unknown>; isRead: boolean; createdAt: string; relatedEntityType?: string; relatedEntityId?: string }
