import { describe, expect, it } from 'vitest';
import { digest, readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('folds a job into one row', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    expect(rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(rows.find((r) => r.job === 'lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok' });
  });

  it('keeps a row whose owner is null', () => {
    const row = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, runs: 1 });
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('renders an empty file as no rows', () => {
    expect(digest('2026-10-30', '')).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('counts lines with a wrong shape as bad', () => {
    const n = digest('x', '{"at":"t","job":"a","status":"maybe","owner":"o"}\n[]\nnull\n{"job":"a"}\n');
    expect(n).toEqual({ night: 'x', rows: [], badLines: 4 });
  });
});
