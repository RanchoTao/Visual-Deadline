const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function formatDeadline(deadline?: string): string {
  if (!deadline) return '无截止日期';

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(deadline));
}

export function formatCountdown(deadline?: string, now = new Date()): string {
  if (!deadline) return '无截止日期';

  const deadlineTime = new Date(deadline).getTime();
  if (Number.isNaN(deadlineTime)) return '截止时间无效';

  const diff = deadlineTime - now.getTime();
  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / MS_PER_DAY);
  const hours = Math.floor((absDiff % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((absDiff % MS_PER_HOUR) / MS_PER_MINUTE);
  const prefix = diff >= 0 ? '还剩' : '已超时';

  if (days > 0) return `${prefix} ${days}天 ${hours}小时`;
  if (hours > 0) return `${prefix} ${hours}小时 ${minutes}分钟`;
  return `${prefix} ${Math.max(minutes, 1)}分钟`;
}

export function toDatetimeLocalValue(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}
