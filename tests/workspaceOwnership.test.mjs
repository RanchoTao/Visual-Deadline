import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { assertWorkspaceSessionOwner, bindWorkspaceValue, canWriteWorkspaceBinding, guestWorkspaceOwner, mergeAuthenticatedWorkspaceRecords, readWorkspaceOwner, readWorkspaceValue, resolveWorkspaceAuth, setWorkspaceOwner, updateWorkspaceBinding, userWorkspaceOwner, workspaceOnboardingFallback, workspaceOwnerKey, workspaceStorageKey, writeWorkspaceValue } = await import('./.compiled/src/storage/workspace.js');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

test('guest legacy data remains a guest-only recovery source when a brand-new user authenticates', () => {
  const storage = createStorage({
    'visualized-deadline.tasks': JSON.stringify([{ id: 'guest-task' }]),
    'visualized-deadline.goals': JSON.stringify([{ id: 'guest-goal' }]),
    'visualized-deadline.profile': JSON.stringify({ displayName: 'Guest profile' }),
  });
  const guest = guestWorkspaceOwner(); const newUser = userWorkspaceOwner('new-user');
  assert.deepEqual(readWorkspaceValue(storage, guest, 'visualized-deadline.tasks', []), [{ id: 'guest-task' }]);
  setWorkspaceOwner(storage, newUser);
  assert.deepEqual(readWorkspaceValue(storage, newUser, 'visualized-deadline.tasks', []), []);
  assert.deepEqual(readWorkspaceValue(storage, newUser, 'visualized-deadline.goals', []), []);
  assert.equal(readWorkspaceValue(storage, newUser, 'visualized-deadline.profile', null), null);
  assert.deepEqual(JSON.parse(storage.getItem('visualized-deadline.tasks')), [{ id: 'guest-task' }]);
  assert.deepEqual(JSON.parse(storage.getItem('visualized-deadline.goals')), [{ id: 'guest-goal' }]);
  assert.deepEqual(JSON.parse(storage.getItem('visualized-deadline.profile')), { displayName: 'Guest profile' });
  assert.equal(readWorkspaceOwner(storage).userId, 'new-user');
});

test('a pending disabled guest import remains recoverable without becoming authenticated workspace data', () => {
  const pendingKey = 'vd.guest-import.pending.v1';
  const storage = createStorage({
    'visualized-deadline.tasks': JSON.stringify([{ id: 'guest-task' }]),
    [pendingKey]: JSON.stringify({ version: 1, immutable: true, sourceChecksum: 'guest-checksum' }),
  });
  const user = userWorkspaceOwner('new-user');
  setWorkspaceOwner(storage, user);
  assert.deepEqual(readWorkspaceValue(storage, user, 'visualized-deadline.tasks', []), []);
  assert.equal(storage.getItem(pendingKey), JSON.stringify({ version: 1, immutable: true, sourceChecksum: 'guest-checksum' }));
  assert.equal(storage.values.has(workspaceStorageKey(user, 'visualized-deadline.tasks')), false);
});

test('owner-scoped caches isolate user A, user B, and a returning user A in one browser', () => {
  const storage = createStorage(); const a = userWorkspaceOwner('user-a'); const b = userWorkspaceOwner('user-b');
  writeWorkspaceValue(storage, a, 'visualized-deadline.tasks', [{ id: 'task-a' }]);
  writeWorkspaceValue(storage, a, 'visualized-deadline.profile', { displayName: 'A' });
  writeWorkspaceValue(storage, a, 'visualized-deadline.social.nodes', [{ id: 'social-a' }]);
  writeWorkspaceValue(storage, b, 'visualized-deadline.tasks', [{ id: 'task-b' }]);
  assert.deepEqual(readWorkspaceValue(storage, b, 'visualized-deadline.tasks', []), [{ id: 'task-b' }]);
  assert.equal(readWorkspaceValue(storage, b, 'visualized-deadline.profile', null), null);
  assert.deepEqual(readWorkspaceValue(storage, b, 'visualized-deadline.social.nodes', []), []);
  assert.deepEqual(readWorkspaceValue(storage, a, 'visualized-deadline.tasks', []), [{ id: 'task-a' }]);
  assert.deepEqual(readWorkspaceValue(storage, a, 'visualized-deadline.profile', null), { displayName: 'A' });
  assert.notEqual(workspaceStorageKey(a, 'visualized-deadline.profile'), workspaceStorageKey(b, 'visualized-deadline.profile'));
});

test('an existing account reconciles only its owner cache and cloud rows, never the guest source', () => {
  const storage = createStorage({ 'visualized-deadline.tasks': JSON.stringify([{ id: 'guest-task' }]) });
  const owner = userWorkspaceOwner('existing-user');
  writeWorkspaceValue(storage, owner, 'visualized-deadline.tasks', [{ id: 'cached-user-task' }]);
  const result = mergeAuthenticatedWorkspaceRecords(owner, 'existing-user', readWorkspaceValue(storage, owner, 'visualized-deadline.tasks', []), [{ id: 'cloud-user-task' }]);
  assert.deepEqual(result, [{ id: 'cached-user-task' }, { id: 'cloud-user-task' }]);
  assert.equal(result.some((item) => item.id === 'guest-task'), false);
});

test('an empty authenticated workspace stays empty across refresh until matching cloud data exists', () => {
  const storage = createStorage({ 'visualized-deadline.tasks': JSON.stringify([{ id: 'guest-task' }]) });
  const owner = userWorkspaceOwner('empty-user');
  setWorkspaceOwner(storage, owner);
  assert.deepEqual(readWorkspaceValue(storage, readWorkspaceOwner(storage), 'visualized-deadline.tasks', []), []);
  assert.deepEqual(mergeAuthenticatedWorkspaceRecords(owner, 'empty-user', [], []), []);
});

test('a stale persisted owner is replaced by the authoritative session owner and cloud writes fail closed on mismatch', () => {
  const storage = createStorage(); const a = userWorkspaceOwner('user-a'); const b = userWorkspaceOwner('user-b');
  setWorkspaceOwner(storage, a);
  assert.equal(workspaceOwnerKey(readWorkspaceOwner(storage)), 'user:user-a');
  assert.throws(() => assertWorkspaceSessionOwner(a, 'user-b'), /WORKSPACE_OWNER_SESSION_MISMATCH/);
  setWorkspaceOwner(storage, b);
  assert.doesNotThrow(() => assertWorkspaceSessionOwner(readWorkspaceOwner(storage), 'user-b'));
});

test('every cloud sync entrypoint checks the active owner before its first transport call', () => {
  const source = readFileSync('src/lib/cloudSync.ts', 'utf8');
  for (const name of ['loadCloudData', 'saveCloudTasks', 'saveCloudGoals', 'saveCloudPressureHistory', 'loadCloudLifeEvents', 'upsertCloudLifeEvents', 'deleteCloudLifeEvent', 'saveCloudProfile']) {
    const start = source.indexOf(`export async function ${name}`);
    const next = source.indexOf('\nexport async function ', start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    const guard = body.indexOf('assertWorkspaceSessionOwner(owner, session.user.id);');
    const transport = Math.min(...['withCloudSyncErrors', 'supabase.rest'].map((needle) => {
      const index = body.indexOf(needle);
      return index === -1 ? Number.POSITIVE_INFINITY : index;
    }));
    assert.ok(start >= 0 && guard >= 0 && guard < transport, `${name} must reject owner/session mismatch before transport`);
  }
});

test('failed authentication has no workspace-owner transition or authenticated cache creation', () => {
  const storage = createStorage({ 'visualized-deadline.goals': JSON.stringify([{ id: 'guest-goal' }]) });
  assert.equal(workspaceOwnerKey(readWorkspaceOwner(storage)), 'guest');
  assert.equal(storage.values.has(workspaceStorageKey(userWorkspaceOwner('never-authenticated'), 'visualized-deadline.goals')), false);
  assert.deepEqual(readWorkspaceValue(storage, guestWorkspaceOwner(), 'visualized-deadline.goals', []), [{ id: 'guest-goal' }]);
});

test('auth unresolved never changes a persisted owner or authorizes a workspace binding', () => {
  const storage = createStorage(); const a = userWorkspaceOwner('user-a');
  setWorkspaceOwner(storage, a);
  const unresolved = resolveWorkspaceAuth(false, undefined);
  assert.deepEqual(unresolved, { state: 'unresolved' });
  const binding = bindWorkspaceValue(undefined, [], () => { throw new Error('unresolved auth must not read'); });
  assert.equal(binding.ownerKey, undefined);
  assert.equal(canWriteWorkspaceBinding(binding, undefined), false);
  assert.equal(workspaceOwnerKey(readWorkspaceOwner(storage)), 'user:user-a');
});

test('resolved session A hydrates A directly while resolved null reaches guest only after auth completion', () => {
  const storage = createStorage({
    'visualized-deadline.tasks': JSON.stringify([{ id: 'guest-task' }]),
    [workspaceStorageKey(userWorkspaceOwner('user-a'), 'visualized-deadline.tasks')]: JSON.stringify([{ id: 'a-task' }]),
  });
  const aResolution = resolveWorkspaceAuth(true, 'user-a');
  assert.equal(aResolution.state, 'resolved');
  const aBinding = bindWorkspaceValue(aResolution.owner, [], (owner) => readWorkspaceValue(storage, owner, 'visualized-deadline.tasks', []));
  assert.deepEqual(aBinding.value, [{ id: 'a-task' }]);
  const guestResolution = resolveWorkspaceAuth(true, undefined);
  assert.equal(guestResolution.state, 'resolved');
  const guestBinding = bindWorkspaceValue(guestResolution.owner, [], (owner) => readWorkspaceValue(storage, owner, 'visualized-deadline.tasks', []));
  assert.deepEqual(guestBinding.value, [{ id: 'guest-task' }]);
});

test('stale A and guest setters cannot write during a transition to B or a new user', () => {
  const a = userWorkspaceOwner('user-a'); const b = userWorkspaceOwner('user-b'); const guest = guestWorkspaceOwner();
  const aBinding = bindWorkspaceValue(a, [{ id: 'a-task' }], () => [{ id: 'a-task' }]);
  const staleA = updateWorkspaceBinding(aBinding, b, () => [{ id: 'must-not-reach-b' }]);
  assert.deepEqual(staleA, aBinding);
  assert.equal(canWriteWorkspaceBinding(staleA, b), false);
  const guestBinding = bindWorkspaceValue(guest, [{ id: 'guest-task' }], () => [{ id: 'guest-task' }]);
  const staleGuest = updateWorkspaceBinding(guestBinding, b, () => [{ id: 'must-not-reach-user' }]);
  assert.deepEqual(staleGuest, guestBinding);
  assert.equal(canWriteWorkspaceBinding(staleGuest, b), false);
});

test('new user defaults never inherit guest onboarding or pressure fallback values', () => {
  const storage = createStorage({
    'visualized-deadline.onboardingComplete': JSON.stringify(true),
    'visualized-deadline.baselinePressure': JSON.stringify(91),
  });
  const user = userWorkspaceOwner('new-user');
  const onboarding = bindWorkspaceValue(user, false, (owner) => readWorkspaceValue(storage, owner, 'visualized-deadline.onboardingComplete', false));
  const pressure = bindWorkspaceValue(user, 35, (owner) => readWorkspaceValue(storage, owner, 'visualized-deadline.baselinePressure', 35));
  assert.equal(onboarding.value, false);
  assert.equal(pressure.value, 35);
  assert.equal(workspaceOnboardingFallback(storage, user), false);
  assert.equal(workspaceOnboardingFallback(storage, guestWorkspaceOwner()), true);
});

test('refreshing A and A-to-guest-to-B resolution produce only each authoritative owner binding', () => {
  const a = userWorkspaceOwner('user-a'); const b = userWorkspaceOwner('user-b');
  const refreshA = resolveWorkspaceAuth(true, 'user-a');
  const logout = resolveWorkspaceAuth(true, undefined);
  const loginB = resolveWorkspaceAuth(true, 'user-b');
  assert.equal(refreshA.owner && workspaceOwnerKey(refreshA.owner), workspaceOwnerKey(a));
  assert.equal(logout.owner && workspaceOwnerKey(logout.owner), 'guest');
  assert.equal(loginB.owner && workspaceOwnerKey(loginB.owner), workspaceOwnerKey(b));
  const aBinding = bindWorkspaceValue(a, 'fallback', () => 'A');
  assert.equal(canWriteWorkspaceBinding(aBinding, loginB.owner), false);
  const bBinding = bindWorkspaceValue(b, 'fallback', () => 'B');
  assert.equal(canWriteWorkspaceBinding(bBinding, loginB.owner), true);
});
