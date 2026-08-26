export type TimelineStatus = 'completed' | 'in_progress' | 'planned' | 'unplanned';
export type TimelineItemType = 'life_stage' | 'annual_goal' | 'project' | 'task';

export interface TimelineItem {
  id: string;
  type: TimelineItemType;
  title: string;
  subtitle?: string;
  startDate: string;
  endDate?: string;
  status: TimelineStatus;
  description?: string;
  priority?: number;
}

export type TimelineZoom = 'life' | 'decade' | 'year' | 'month' | 'week' | 'day';

