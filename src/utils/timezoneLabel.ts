const names: Record<string,string> = {
  'Asia/Shanghai': '北京时间（UTC+8）',
  'Asia/Chongqing': '北京时间（UTC+8）',
  'Asia/Tokyo': '日本时间（UTC+9）',
  'UTC': '协调世界时（UTC）',
  'Etc/UTC': '协调世界时（UTC）',
};
export function formatWorkspaceTimezone(zone: string): string { return names[zone] || zone.replaceAll('_', ' '); }
