import type { UserProfile } from '../../types/task';

function parseMetric(value: string): number | undefined {
  const numeric = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

export function calculateBMI(profile: UserProfile): number | undefined {
  const heightCm = parseMetric(profile.height);
  const weightKg = parseMetric(profile.weight);
  if (!heightCm || !weightKg) return undefined;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function getHealthReadiness(profile: UserProfile): string {
  const bmi = calculateBMI(profile);
  if (!bmi) return '等待身体数据接入';
  if (bmi < 18.5) return '体重偏低样本，需要结合恢复数据判断';
  if (bmi >= 24) return '体重压力可能影响长期恢复，建议继续观察';
  return '基础身体数据处于常规区间';
}
