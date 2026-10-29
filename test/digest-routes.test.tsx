import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

let runsDir: string;
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

// Job names as they appear in the page's table, first cell of each row, in page order.
function pageJobs(html: string): string[] {
  const body = html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));
  return [...body.matchAll(/<tr>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1]!);
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-'));
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

  // "sync" is logged first, so the sort by job name is what puts "backup" before it.
  writeFileSync(
    join(runsDir, '2026-10-28.jsonl'),
    [
      '{"at":"2026-10-28T01:00:00+01:00","job":"sync","status":"ok","owner":null,"error":null}',
      '{"at":"2026-10-28T02:00:00+01:00","job":"backup","status":"retry","owner":"ops","error":null}',
      '{"at":"2026-10-28T02:05:00+01:00","job":"backup","status":"retry","owner":"ops","error":null}',
      '{"at":"2026-10-28T02:10:00+01:00","job":"backup","status":"retry","owner":"ops","error":null}',
      '{"at":"2026-10-28T02:15:00+01:00","job":"backup","status":"fail","owner":"ops","error":"disk full"}',
      '',
    ].join('\n'),
  );
  writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-10-30.jsonl'),
    [
      '{"at":"2026-10-30T03:00:00+01:00","job":"sync","status":"ok","owner":null,"error":null}',
      'this line is not json',
      '',
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night and /api/digest/:night', () => {
  it('200 for a night with a file: page and JSON list the same jobs in the same order', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/2026-10-28');
    const html = await page.text();
    const api = await app.request('/api/digest/2026-10-28');
    const json = (await api.json()) as Night;

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(html).toContain('backup');
    expect(html).toContain('sync');
    expect(json.rows.map((r) => r.job)).toEqual(['backup', 'sync']);
    expect(pageJobs(html)).toEqual(json.rows.map((r) => r.job));
  });

  it('404 for a night with no file, on both routes', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/2026-10-25');
    const api = await app.request('/api/digest/2026-10-25');

    expect(page.status).toBe(404);
    expect(await page.text()).toContain('no log for this night');
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: 'no such night', night: '2026-10-25' });
  });

  it('empty night: page says nothing ran, JSON has no rows', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/2026-10-29');
    const api = await app.request('/api/digest/2026-10-29');

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ night: '2026-10-29', rows: [], badLines: 0 });
  });

  it('bad line: page reports it and still shows the valid job; JSON counts it', async () => {
    const app = createApp(config);
    const page = await app.request('/digest/2026-10-30');
    const html = await page.text();
    const api = await app.request('/api/digest/2026-10-30');
    const json = (await api.json()) as Night;

    expect(page.status).toBe(200);
    expect(html).toContain('1 line could not be read');
    expect(html).toContain('sync');
    expect(json.badLines).toBe(1);
    expect(json.rows.map((r) => r.job)).toEqual(['sync']);
  });

  it('page marks a failed job and a job with 3+ retries with class="warn"', async () => {
    const html = await (await createApp(config).request('/digest/2026-10-28')).text();

    expect(html).toContain('<td class="warn">3 (many)</td>');
    expect(html).toContain('<td class="warn">fail (!)</td>');
    expect(html).toContain('disk full');
  });

  it('null owner shows as an em dash on the page', async () => {
    const app = createApp(config);
    const html = await (await app.request('/digest/2026-10-28')).text();
    const json = (await (await app.request('/api/digest/2026-10-28')).json()) as Night;
    const sync = json.rows.find((r) => r.job === 'sync');

    expect(sync?.owner).toBeNull();
    expect(html).toMatch(/<td>sync<\/td>\s*<td>—<\/td>/);
  });
});
