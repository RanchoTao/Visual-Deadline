import type { GoalDependency, LifeNode } from '../../types/lifePlanning';

export const demoLifeNodes: LifeNode[] = [
  { id: 'd-research', layer: 'direction', title: 'Researcher + Engineer', status: 'focus', domain: 'research', importance: 10 },
  { id: 'g-researcher', layer: 'long_term', title: '成为高水平 AI 研究者', parentId: 'd-research', status: 'focus', domain: 'research', importance: 10, deadline: '2032-12-31' },
  { id: 's-graduate', layer: 'stage', title: '研究生升学', parentId: 'g-researcher', status: 'focus', domain: 'study', importance: 10, expectedEndDate: '2027-09-01' },
  { id: 'p-math', layer: 'phase', title: '考研基础期', parentId: 's-graduate', status: 'focus', domain: 'study', importance: 10, startDate: '2026-07-01', expectedEndDate: '2026-10-15', focusLevel: 10, resourceBudget: { minutesPerWeek: 900 }, successCriteria: '数学基础课程与题库第一轮完成' },
  { id: 'm-math', layer: 'milestone', title: '完成数学基础第一轮', parentId: 'p-math', status: 'focus', domain: 'study', importance: 10, deadline: '2026-10-15', successCriteria: '章节测试达到 80%' },
  { id: 't-math', layer: 'task', title: '高数章节学习', parentId: 'm-math', status: 'focus', domain: 'study', importance: 10, nextAction: '打开笔记，完成极限章节第 1–10 题', resourceBudget: { minutesPerWeek: 240 } },
  { id: 'p-experiment', layer: 'phase', title: 'ICLR 最小实验', parentId: 'g-researcher', status: 'secondary', domain: 'research', importance: 9, expectedEndDate: '2026-11-01', successCriteria: '获得可复现实验 GO 结果' },
  { id: 'm-experiment', layer: 'milestone', title: 'Experiment GO', parentId: 'p-experiment', status: 'secondary', domain: 'research', importance: 9, deadline: '2026-10-01' },
  { id: 't-paper', layer: 'task', title: '完整实验与论文初稿', parentId: 'm-experiment', status: 'blocked', domain: 'research', importance: 9, nextAction: '建立完整实验配置' },
  { id: 'd-body', layer: 'direction', title: '健康强壮灵活的身体', status: 'maintenance', domain: 'fitness', importance: 8 },
  { id: 'g-strength', layer: 'long_term', title: '建立稳定身体训练系统', parentId: 'd-body', status: 'maintenance', domain: 'fitness', importance: 8 },
  { id: 'p-bulk', layer: 'phase', title: '秋季增肌期', parentId: 'g-strength', status: 'maintenance', domain: 'fitness', importance: 7, startDate: '2026-09-01', expectedEndDate: '2026-12-20', resourceBudget: { minutesPerWeek: 240 }, successCriteria: '每周稳定训练 3 次' },
  { id: 't-training', layer: 'task', title: '本周力量训练', parentId: 'p-bulk', status: 'maintenance', domain: 'fitness', importance: 7, nextAction: '换好训练服，完成 5 分钟热身', resourceBudget: { minutesPerWeek: 60 } },
  { id: 'g-japanese', layer: 'long_term', title: '学习日语', status: 'waiting', domain: 'study', importance: 5 },
];

export const demoDependencies: GoalDependency[] = [
  { id: 'dep-math', sourceId: 'm-math', targetId: 's-graduate', type: 'supports', critical: true },
  { id: 'dep-experiment', sourceId: 'm-experiment', targetId: 't-paper', type: 'requires', critical: true },
  { id: 'dep-conflict', sourceId: 'p-bulk', targetId: 'p-cut', type: 'conflicts_with' },
];

