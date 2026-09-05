import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultLifePreferences,
  createLifeEvent,
  deriveLifeState,
  getLifeEventsForOwner,
  mergeLifeEvents,
  normalizeLifeEventStore,
  planLifeController,
  setLifeEventsForOwner,
  undoLatestLifeEvent,
} from './.compiled/src/domain/life-controller/index.js';

const event = (id, type, timestamp) => ({ id, type, timestamp, metadata: {}, createdAt: timestamp, updatedAt: timestamp });
const now = new Date('2026-09-05T12:00:00.000Z');

test('empty history returns unknown state without invented durations', () => {
  const state = deriveLifeState([], now, 'Asia/Shanghai');
  assert.equal(state.currentSleepState, 'unknown');
  assert.equal(state.awakeDurationMinutes, null);
  assert.equal(state.timeSinceLastMealMinutes, null);
});

test('wake creates awake state and an absolute awake duration', () => {
  const state = deriveLifeState([event('wake-1', 'wake', '2026-09-05T01:00:00.000Z')], now, 'Asia/Shanghai');
  assert.equal(state.currentSleepState, 'awake');
  assert.equal(state.lastWakeAt, '2026-09-05T01:00:00.000Z');
  assert.equal(state.awakeDurationMinutes, 660);
});

test('sleep_start followed by wake derives sleep duration', () => {
  const state = deriveLifeState([
    event('sleep-1', 'sleep_start', '2026-09-04T17:00:00.000Z'),
    event('wake-1', 'wake', '2026-09-05T01:00:00.000Z'),
  ], now, 'Asia/Shanghai');
  assert.equal(state.lastSleepDurationMinutes, 480);
});

test('meal derives elapsed time and meals in the zoned calendar day', () => {
  const state = deriveLifeState([
    event('meal-1', 'meal', '2026-09-04T16:30:00.000Z'),
    event('meal-2', 'meal', '2026-09-05T08:30:00.000Z'),
  ], now, 'Asia/Shanghai');
  assert.equal(state.timeSinceLastMealMinutes, 210);
  assert.equal(state.mealsToday, 2);
});

test('cross-midnight durations use absolute instants', () => {
  const state = deriveLifeState([
    event('sleep-1', 'sleep_start', '2026-09-04T15:30:00.000Z'),
    event('wake-1', 'wake', '2026-09-04T23:30:00.000Z'),
  ], new Date('2026-09-05T00:00:00.000Z'), 'Asia/Shanghai');
  assert.equal(state.lastSleepDurationMinutes, 480);
  assert.equal(state.awakeDurationMinutes, 30);
});

test('timezone conversion changes mealsToday without changing absolute duration', () => {
  const events = [event('meal-1', 'meal', '2026-09-05T00:30:00.000Z')];
  const shanghai = deriveLifeState(events, new Date('2026-09-05T01:00:00.000Z'), 'Asia/Shanghai');
  const losAngeles = deriveLifeState(events, new Date('2026-09-05T01:00:00.000Z'), 'America/Los_Angeles');
  assert.equal(shanghai.mealsToday, 1);
  assert.equal(losAngeles.mealsToday, 1);
  assert.equal(shanghai.timeSinceLastMealMinutes, losAngeles.timeSinceLastMealMinutes);

  const boundaryEvents = [event('meal-2', 'meal', '2026-09-04T15:30:00.000Z')];
  assert.equal(deriveLifeState(boundaryEvents, new Date('2026-09-05T01:00:00.000Z'), 'Asia/Shanghai').mealsToday, 0);
  assert.equal(deriveLifeState(boundaryEvents, new Date('2026-09-05T01:00:00.000Z'), 'America/Los_Angeles').mealsToday, 1);
});

test('duplicate wake is explicit and does not reset awake duration', () => {
  const state = deriveLifeState([
    event('wake-1', 'wake', '2026-09-05T01:00:00.000Z'),
    event('wake-2', 'wake', '2026-09-05T02:00:00.000Z'),
  ], now, 'Asia/Shanghai');
  assert.equal(state.awakeDurationMinutes, 660);
  assert.ok(state.warnings.some((warning) => warning.code === 'duplicate_wake'));
});

test('duplicate sleep_start is explicit and preserves the first sleep start', () => {
  const state = deriveLifeState([
    event('sleep-1', 'sleep_start', '2026-09-04T16:00:00.000Z'),
    event('sleep-2', 'sleep_start', '2026-09-04T17:00:00.000Z'),
    event('wake-1', 'wake', '2026-09-05T00:00:00.000Z'),
  ], now, 'Asia/Shanghai');
  assert.equal(state.lastSleepDurationMinutes, 480);
  assert.ok(state.warnings.some((warning) => warning.code === 'duplicate_sleep_start'));
});

test('undo removes exactly the latest event', () => {
  const first = event('wake-1', 'wake', '2026-09-05T01:00:00.000Z');
  const latest = event('meal-1', 'meal', '2026-09-05T08:00:00.000Z');
  const result = undoLatestLifeEvent([latest, first]);
  assert.equal(result.removed?.id, 'meal-1');
  assert.deepEqual(result.events.map((item) => item.id), ['wake-1']);
});

test('serialized event store survives reload normalization', () => {
  const created = createLifeEvent('meal', now, '00000000-0000-4000-8000-000000000001');
  const beforeReload = setLifeEventsForOwner({}, 'guest', [created]);
  const afterReload = normalizeLifeEventStore(JSON.parse(JSON.stringify(beforeReload)));
  assert.deepEqual(getLifeEventsForOwner(afterReload, 'guest'), [created]);
});

test('owner-scoped local stores and merges preserve multi-user isolation', () => {
  const first = event('00000000-0000-4000-8000-000000000001', 'wake', '2026-09-05T01:00:00.000Z');
  const second = event('00000000-0000-4000-8000-000000000002', 'meal', '2026-09-05T08:00:00.000Z');
  let store = setLifeEventsForOwner({}, 'user-a', [first]);
  store = setLifeEventsForOwner(store, 'user-b', [second]);
  assert.deepEqual(getLifeEventsForOwner(store, 'user-a').map((item) => item.id), [first.id]);
  assert.deepEqual(getLifeEventsForOwner(store, 'user-b').map((item) => item.id), [second.id]);
  assert.deepEqual(mergeLifeEvents([first], [first]).map((item) => item.id), [first.id]);
});

test('planner emits at most one NOW and bounded NEXT/LATER queues', () => {
  const preferences = createDefaultLifePreferences('Asia/Shanghai');
  const state = deriveLifeState([
    event('wake-1', 'wake', '2026-09-05T01:00:00.000Z'),
    event('meal-1', 'meal', '2026-09-05T04:00:00.000Z'),
  ], now, preferences.timezone);
  const plan = planLifeController({ currentTime: now, lifeState: state, lifePreferences: preferences, availableTasks: [{ id: 'not-used-in-alpha' }] });
  assert.ok(plan.now === null || typeof plan.now.title === 'string');
  assert.ok(plan.next.length <= 3);
  assert.ok(plan.later.length <= 5);
});
