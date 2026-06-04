const { rotateSnapshots } = require('../src/filters');

test('rotateSnapshots keeps at most 10 snapshots and preserves newest-first', () => {
  const initial = [];
  let snaps = initial;
  for (let i = 1; i <= 12; i++) {
    snaps = rotateSnapshots(snaps, { id: i, timestamp: i });
  }
  expect(snaps.length).toBe(10);
  expect(snaps[0].id).toBe(12);
  expect(snaps[snaps.length - 1].id).toBe(3);
});
