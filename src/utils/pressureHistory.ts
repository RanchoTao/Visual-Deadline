import type { PressureBreakdown, PressureHistoryEventType, PressureHistoryRecord, Task } from '../types/task';

const AUTO_RECORD_WINDOW_MS = 30 * 60 * 1000;
const EVENT_SETTLE_WINDOW_MS = 2 * 60 * 1000;
const MAX_HISTORY_RECORDS = 500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isSameLocalDay(dateA: Date, dateB: Date): boolean {
  return dateA.getFullYear() === dateB.getFullYear() && dateA.getMonth() === dateB.getMonth() && dateA.getDate() === dateB.getDate();
}

function countTasksForToday(tasks: Task[], now: Date): Pick<PressureHistoryRecord, 'completedToday' | 'abandonedToday'> {
  return tasks.reduce(
    (counts, task) => {
      if (task.completedAt && isSameLocalDay(new Date(task.completedAt), now)) counts.completedToday += 1;
      if (task.abandonedAt && isSameLocalDay(new Date(task.abandonedAt), now)) counts.abandonedToday += 1;
      return counts;
    },
    { completedToday: 0, abandonedToday: 0 },
  );
}

export function normalizePressureHistory(records: unknown): PressureHistoryRecord[] {
  if (!Array.isArray(records)) return [];

  return records
    .filter((record): record is Partial<PressureHistoryRecord> => Boolean(record) && typeof record === 'object')
    .map((record) => ({
      id: record.id || crypto.randomUUID(),
      timestamp: record.timestamp || new Date().toISOString(),
      pressure: typeof record.pressure === 'number' && Number.isFinite(record.pressure) ? Math.max(0, Math.round(record.pressure)) : 0,
      currentTaskLoad: typeof record.currentTaskLoad === 'number' && Number.isFinite(record.currentTaskLoad) ? Math.max(0, record.currentTaskLoad) : 0,
      activeTaskCount: typeof record.activeTaskCount === 'number' && Number.isFinite(record.activeTaskCount) ? Math.max(0, Math.round(record.activeTaskCount)) : 0,
      completedToday: typeof record.completedToday === 'number' && Number.isFinite(record.completedToday) ? Math.max(0, Math.round(record.completedToday)) : 0,
      abandonedToday: typeof record.abandonedToday === 'number' && Number.isFinite(record.abandonedToday) ? Math.max(0, Math.round(record.abandonedToday)) : 0,
      recoveryRelief: typeof record.recoveryRelief === 'number' && Number.isFinite(record.recoveryRelief) ? Math.max(0, record.recoveryRelief) : 0,
      note: record.note || undefined,
      eventType: record.eventType || 'auto',
    }))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-MAX_HISTORY_RECORDS);
}

export function createPressureHistoryRecord(
  pressure: PressureBreakdown,
  tasks: Task[],
  eventType: PressureHistoryEventType = 'auto',
  note?: string,
  timestamp = new Date(),
): PressureHistoryRecord {
  const todayCounts = countTasksForToday(tasks, timestamp);

  return {
    id: crypto.randomUUID(),
    timestamp: timestamp.toISOString(),
    pressure: pressure.rawPressure,
    currentTaskLoad: pressure.currentTaskLoad,
    activeTaskCount: tasks.filter((task) => task.lifecycleStatus === 'active').length,
    completedToday: todayCounts.completedToday,
    abandonedToday: todayCounts.abandonedToday,
    recoveryRelief: pressure.recoveryRelief,
    note,
    eventType,
  };
}

function shouldReplaceRecentAutoRecord(lastRecord: PressureHistoryRecord, nextRecord: PressureHistoryRecord): boolean {
  if (nextRecord.eventType !== 'auto' || lastRecord.eventType !== 'auto') return false;
  const lastTime = new Date(lastRecord.timestamp).getTime();
  const nextTime = new Date(nextRecord.timestamp).getTime();
  if (!Number.isFinite(lastTime) || !Number.isFinite(nextTime)) return false;

  return nextTime - lastTime <= AUTO_RECORD_WINDOW_MS;
}

export function appendPressureHistoryRecord(records: PressureHistoryRecord[], nextRecord: PressureHistoryRecord): PressureHistoryRecord[] {
  const safeRecords = normalizePressureHistory(records);
  const lastRecord = safeRecords.at(-1);

  if (lastRecord && nextRecord.eventType === 'auto') {
    const lastTime = new Date(lastRecord.timestamp).getTime();
    const nextTime = new Date(nextRecord.timestamp).getTime();
    const isVeryRecent = Number.isFinite(lastTime) && Number.isFinite(nextTime) && nextTime - lastTime <= EVENT_SETTLE_WINDOW_MS;
    const isSamePressureShape =
      lastRecord.pressure === nextRecord.pressure &&
      lastRecord.currentTaskLoad === nextRecord.currentTaskLoad &&
      lastRecord.activeTaskCount === nextRecord.activeTaskCount &&
      lastRecord.recoveryRelief === nextRecord.recoveryRelief;

    if (isVeryRecent && isSamePressureShape) return safeRecords;
  }

  if (lastRecord && shouldReplaceRecentAutoRecord(lastRecord, nextRecord)) {
    return [...safeRecords.slice(0, -1), { ...nextRecord, id: lastRecord.id }];
  }

  return [...safeRecords, nextRecord].slice(-MAX_HISTORY_RECORDS);
}

export function summarizePressureHistory(records: PressureHistoryRecord[], now = new Date()) {
  const safeRecords = normalizePressureHistory(records);
  const todayRecords = safeRecords.filter((record) => isSameLocalDay(new Date(record.timestamp), now));
  const latestRecord = safeRecords.at(-1);
  const todayPressures = todayRecords.map((record) => record.pressure);
  const todayHighest = todayPressures.length ? Math.max(...todayPressures) : latestRecord?.pressure ?? 0;
  const todayLowest = todayPressures.length ? Math.min(...todayPressures) : latestRecord?.pressure ?? 0;

  return {
    currentPressure: latestRecord?.pressure ?? 0,
    todayHighest,
    todayLowest,
    volatility: todayHighest - todayLowest,
    recordCount: safeRecords.length,
  };
}

export function isBurnoutRiskRecord(record: PressureHistoryRecord): boolean {
  return record.pressure >= 100;
}

export function isRecentPressureRecord(record: PressureHistoryRecord, now = new Date(), days = 14): boolean {
  const timestamp = new Date(record.timestamp).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return now.getTime() - timestamp <= days * MS_PER_DAY;
}

// Future potential: this history can support personalized pressure forecasting,
// volatility analysis, burnout prediction, machine learning from user behavior,
// and studying how task types correlate with individual pressure response.
// v0.6.2 intentionally records only local time-series data; no ML or cloud sync is implemented.
