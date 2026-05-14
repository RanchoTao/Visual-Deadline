import type { PressureHistoryRecord } from '../../types/task';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dateKey(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calculatePressureVolatility(records: PressureHistoryRecord[]): number {
  if (records.length < 2) return 0;
  const avg = average(records.map((record) => record.pressure));
  const variance = average(records.map((record) => (record.pressure - avg) ** 2));
  return Math.round(Math.sqrt(variance));
}

export function calculateOverloadFrequency(records: PressureHistoryRecord[]): number {
  if (records.length === 0) return 0;
  return Math.round((records.filter((record) => record.pressure >= 81).length / records.length) * 100);
}

export function calculateContinuousOverloadDays(records: PressureHistoryRecord[], now = new Date()): number {
  const pressureByDate = new Map<string, number[]>();
  records.forEach((record) => {
    const key = dateKey(record.timestamp);
    if (!key) return;
    pressureByDate.set(key, [...(pressureByDate.get(key) ?? []), record.pressure]);
  });

  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const key = dateKey(new Date(now.getTime() - offset * MS_PER_DAY).toISOString());
    const values = key ? pressureByDate.get(key) : undefined;
    if (!values?.length || Math.max(...values) < 81) break;
    streak += 1;
  }
  return streak;
}

export function calculateRecoverySpeed(records: PressureHistoryRecord[]): string {
  let latestSpikeIndex = -1;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].pressure >= 81) {
      latestSpikeIndex = index;
      break;
    }
  }
  if (latestSpikeIndex < 0) return '暂无高压样本';
  const recovery = records.slice(latestSpikeIndex + 1).find((record) => record.pressure < 61);
  if (!recovery) return '尚未恢复到可控区';
  const hours = (new Date(recovery.timestamp).getTime() - new Date(records[latestSpikeIndex].timestamp).getTime()) / (60 * 60 * 1000);
  return `${Math.max(1, Math.round(hours))} 小时`;
}

export function buildPressureHistogram(records: PressureHistoryRecord[]): number[] {
  const buckets = [0, 0, 0, 0, 0];
  records.forEach((record) => {
    if (record.pressure <= 30) buckets[0] += 1;
    else if (record.pressure <= 60) buckets[1] += 1;
    else if (record.pressure <= 80) buckets[2] += 1;
    else if (record.pressure <= 100) buckets[3] += 1;
    else buckets[4] += 1;
  });
  return buckets;
}

export function getPressureInsight(records: PressureHistoryRecord[]): string {
  const volatility = calculatePressureVolatility(records);
  const overload = calculateOverloadFrequency(records);
  if (overload > 35) return '高压出现频率偏高。系统观察到你的生活节奏正在频繁进入过载区。';
  if (volatility > 28) return '压力波动较大。你可能更依赖短周期冲刺，而不是稳定推进。';
  if (records.some((record) => record.pressure > 100)) return '出现过 100+ 压力峰值。VD 会继续记录恢复速度与复发频率。';
  return '压力曲线暂时没有明显失控迹象。继续观察长期趋势比单次读数更重要。';
}
