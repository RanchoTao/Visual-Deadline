export const NOW = Date.parse('2026-09-16T12:00:00.000Z');
export const iso = (offset) => new Date(NOW + offset).toISOString();

export const legacyTask = (id, overrides = {}) => ({
  id,
  title: id,
  importance: 6,
  progress: 0,
  activityType: 'work',
  lifecycleStatus: 'active',
  schemaVersion: 3,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  ...overrides,
});

export const goals = [
  { id: 'goal-one-sided', title: 'One sided', category: 'work', priority: 7, linkedTaskIds: ['one-sided-goal'], createdAt: iso(-30), updatedAt: iso(-20) },
  { id: 'goal-multi-a', title: 'Multi A', category: 'work', priority: 7, linkedTaskIds: ['multiple-goals'], createdAt: iso(-30), updatedAt: iso(-20) },
  { id: 'goal-multi-b', title: 'Multi B', category: 'work', priority: 7, linkedTaskIds: ['multiple-goals'], createdAt: iso(-30), updatedAt: iso(-20) },
];

export const tasks = [
  legacyTask('completed', { importance: 10, deadline: iso(-1), lifecycleStatus: 'completed', progress: 100, completedAt: iso(-1000) }),
  legacyTask('progress-100-active', { importance: 10, deadline: iso(-1), progress: 100 }),
  legacyTask('abandoned', { importance: 10, deadline: iso(-1), lifecycleStatus: 'abandoned' }),
  legacyTask('dependency-open', { importance: 2, deadline: iso(14 * 86400000) }),
  legacyTask('dependency-done', { importance: 2, deadline: iso(14 * 86400000), lifecycleStatus: 'completed', progress: 100, completedAt: iso(-2000) }),
  legacyTask('blocked-high', { importance: 10, deadline: iso(-1), dependencyIds: ['dependency-open'] }),
  legacyTask('future-start', { importance: 10, deadline: iso(-1), startDate: iso(86400000) }),
  legacyTask('missing-dependency', { importance: 10, deadline: iso(-1), dependencyIds: ['does-not-exist'] }),
  legacyTask('overdue-high', { importance: 9, deadline: iso(-1) }),
  legacyTask('malformed-negative-progress', { importance: 8, deadline: iso(-1), progress: -5 }),
  legacyTask('unblocked-by-done', { importance: 8, deadline: iso(3 * 3600000), dependencyIds: ['dependency-done'] }),
  legacyTask('deadline-one-hour', { importance: 7, deadline: iso(3600000) }),
  legacyTask('date-only-deadline', { importance: 7, deadline: '2026-09-17' }),
  legacyTask('ordinary-active', { importance: 6, deadline: iso(7 * 86400000) }),
  legacyTask('future-deadline', { importance: 7, deadline: iso(40 * 86400000), activityType: 'study' }),
  legacyTask('no-deadline', { importance: 8, deadline: undefined, activityType: 'other' }),
  legacyTask('tie-b', { importance: 6, deadline: iso(20 * 86400000), activityType: 'social' }),
  legacyTask('tie-a', { importance: 6, deadline: iso(20 * 86400000), activityType: 'social' }),
  legacyTask('one-sided-goal', { importance: 5, deadline: iso(12 * 86400000) }),
  legacyTask('multiple-goals', { importance: 5, deadline: iso(13 * 86400000), linkedGoalIds: ['goal-multi-a', 'goal-multi-b'] }),
  legacyTask('recovery', { importance: 4, deadline: iso(2 * 86400000), activityType: 'recovery' }),
  legacyTask('malformed-over-progress', { importance: 9, deadline: iso(2 * 3600000), progress: 120 }),
];

export const expectedLegacy = {
  homeTop3: ['blocked-high', 'future-start', 'missing-dependency'],
  priorityMapTop5: ['completed', 'progress-100-active', 'abandoned', 'blocked-high', 'future-start'],
  dailyQuestTaskIds: ['blocked-high', 'future-start', 'missing-dependency', 'recovery', 'ordinary-active', 'one-sided-goal', 'multiple-goals', 'tie-b', 'tie-a'],
};
