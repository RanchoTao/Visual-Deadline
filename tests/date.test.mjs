import assert from 'node:assert/strict';
import test from 'node:test';

const { formatDeadline, formatCountdown } = await import('./.compiled/src/utils/date.js');

for (const deadline of ['not-a-date', '2026-13-40', '   ']) {
  test('invalid deadline returns the existing fallback: ' + JSON.stringify(deadline), () => {
    assert.equal(formatDeadline(deadline), '截止时间无效');
    assert.equal(formatDeadline(deadline), formatCountdown(deadline));
  });
}

test('absent and empty deadlines retain the existing missing-date label', () => {
  for (const deadline of [undefined, '']) {
    assert.equal(formatDeadline(deadline), '无截止日期');
    assert.equal(formatCountdown(deadline), '无截止日期');
  }
});

test('valid timezone-offset deadlines retain the existing Intl formatting and source value', () => {
  const source = Object.freeze({ deadline: '2026-10-07T12:30:00+05:30' });
  const parsed = new Date(source.deadline);
  const originalTime = parsed.getTime();
  const expected = new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
  assert.equal(formatDeadline(source.deadline), expected);
  assert.equal(formatDeadline(source.deadline), formatDeadline('2026-10-07T07:00:00.000Z'));
  assert.equal(source.deadline, '2026-10-07T12:30:00+05:30');
  assert.equal(parsed.getTime(), originalTime);
});
