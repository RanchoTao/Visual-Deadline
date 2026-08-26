import type { TimelineItem } from './types';

export const lifeStages: TimelineItem[] = [
  { id: 'childhood', type: 'life_stage', title: '童年', subtitle: '0–6 岁', startDate: '2003', endDate: '2009', status: 'completed', description: '好奇心与安全感形成的起点。' },
  { id: 'primary', type: 'life_stage', title: '小学', subtitle: '7–12 岁', startDate: '2010', endDate: '2015', status: 'completed' },
  { id: 'middle', type: 'life_stage', title: '初中', subtitle: '13–15 岁', startDate: '2016', endDate: '2018', status: 'completed' },
  { id: 'high', type: 'life_stage', title: '高中', subtitle: '16–18 岁', startDate: '2019', endDate: '2021', status: 'completed' },
  { id: 'college', type: 'life_stage', title: '大学', subtitle: '19–22 岁', startDate: '2022', endDate: '2026', status: 'in_progress', description: '探索研究方向，建立长期能力结构。' },
  { id: 'graduate', type: 'life_stage', title: '研究生', subtitle: '23–26 岁', startDate: '2027', endDate: '2030', status: 'planned' },
  { id: 'career', type: 'life_stage', title: '职业起步', subtitle: '27–32 岁', startDate: '2031', endDate: '2036', status: 'planned' },
  { id: 'venture', type: 'life_stage', title: '科研 / 创业', subtitle: '33–45 岁', startDate: '2037', endDate: '2049', status: 'planned' },
  { id: 'longterm', type: 'life_stage', title: '长期目标', subtitle: '46 岁 +', startDate: '2050', status: 'unplanned' },
];

export const annualGoals: TimelineItem[] = [
  { id: 'university', type: 'annual_goal', title: '考上理想大学', subtitle: '2022', startDate: '2022', status: 'completed', description: '已完成的重要人生里程碑。', priority: 9 },
  { id: 'toefl', type: 'annual_goal', title: '托福 100+', subtitle: '2024', startDate: '2024', status: 'completed', priority: 7 },
  { id: 'vd', type: 'annual_goal', title: 'VD 上线', subtitle: '2026 · 当前', startDate: '2026', status: 'in_progress', description: '让人生规划与每日执行进入同一个系统。', priority: 10 },
  { id: 'iclr', type: 'annual_goal', title: 'ICLR 投稿', subtitle: '2027', startDate: '2027', status: 'planned', priority: 9 },
  { id: 'fitness', type: 'annual_goal', title: '体脂降到 10%', subtitle: '2027', startDate: '2027', status: 'planned', priority: 6 },
  { id: 'digital-life', type: 'annual_goal', title: '数字生命模型', subtitle: '2030+', startDate: '2030', status: 'unplanned', priority: 10 },
];

export const projects: TimelineItem[] = [
  { id: 'sophomore-2', type: 'project', title: '大二下学期', subtitle: '2025.02 — 2025.07', startDate: '2025-02', endDate: '2025-07', status: 'completed' },
  { id: 'junior-1', type: 'project', title: '大三上学期', subtitle: '2025.09 — 2026.01', startDate: '2025-09', endDate: '2026-01', status: 'completed' },
  { id: 'paper', type: 'project', title: '论文初稿', subtitle: '研究主线 · 68%', startDate: '2026-02', endDate: '2026-09', status: 'in_progress', description: '完成核心实验、结构梳理与初稿撰写。', priority: 10 },
  { id: 'research-a', type: 'project', title: '科研项目 A', subtitle: '模型与实验', startDate: '2026-05', endDate: '2026-12', status: 'in_progress', priority: 8 },
  { id: 'venture-prep', type: 'project', title: '创业准备', subtitle: '产品验证', startDate: '2027', endDate: '2028', status: 'planned', priority: 7 },
];

export const statusLabels = { completed: '已完成', in_progress: '进行中', planned: '待开始', unplanned: '未规划' } as const;

