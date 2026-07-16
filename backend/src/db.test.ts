import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('pg', () => {
  class Pool {
    query = mockQuery;
    totalCount = 0;
    idleCount = 0;
    waitingCount = 0;
  }
  return { default: { Pool } };
});

const { initDb, insertEvents, queryRecentEvents } = await import('./db.js');
const { eventsInsertedTotal, register } = await import('./metrics.js');

describe('pg pool gauges', () => {
  it('report the pool counts when the registry is scraped', async () => {
    const output = await register.metrics();

    expect(output).toContain('pg_pool_total_connections 0');
    expect(output).toContain('pg_pool_idle_connections 0');
    expect(output).toContain('pg_pool_waiting_requests 0');
  });
});

describe('initDb', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockQuery.mockReset();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('creates the table and indexes, then logs success', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await initDb(3, 0);

    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS events');
    expect(mockQuery.mock.calls[1][0]).toContain('events_occurred_at_idx');
    expect(mockQuery.mock.calls[2][0]).toContain('events_service_occurred_at_idx');
    expect(consoleLogSpy).toHaveBeenCalledWith('Connected to Postgres');
  });

  it('retries after an Error rejection and then succeeds', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue({ rows: [] });

    await initDb(3, 0);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Postgres not ready yet (attempt 1/3): ECONNREFUSED'),
    );
  });

  it('retries after a non-Error rejection (String(err) branch)', async () => {
    mockQuery.mockRejectedValueOnce('boom').mockResolvedValue({ rows: [] });

    await initDb(3, 0);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3): boom'));
  });

  it('throws after exhausting all retries', async () => {
    mockQuery.mockRejectedValue(new Error('down'));

    await expect(initDb(2, 0)).rejects.toThrow('Could not connect to Postgres after multiple retries');
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});

describe('insertEvents', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('is a no-op for an empty array', async () => {
    await insertEvents([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('builds a multi-row parameterized INSERT and increments the counter', async () => {
    mockQuery.mockResolvedValue({ rowCount: 2 });
    const before = (await eventsInsertedTotal.get()).values[0]?.value ?? 0;

    await insertEvents([
      {
        id: '1',
        service: 'checkout',
        eventType: 'order_placed',
        payload: '{"a":1}',
        timestamp: '2026-01-01T00:00:00.000Z',
      },
      {
        id: '2',
        service: 'auth',
        eventType: 'user_login',
        payload: null,
        timestamp: '2026-01-01T00:01:00.000Z',
      },
    ]);

    const [sql, values] = mockQuery.mock.calls[0];
    expect(sql).toContain('($1, $2, $3, $4, $5)');
    expect(sql).toContain('($6, $7, $8, $9, $10)');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(values).toEqual([
      '1',
      'checkout',
      'order_placed',
      '{"a":1}',
      '2026-01-01T00:00:00.000Z',
      '2',
      'auth',
      'user_login',
      null,
      '2026-01-01T00:01:00.000Z',
    ]);

    const after = (await eventsInsertedTotal.get()).values[0]?.value ?? 0;
    expect(after).toBe(before + 2);
  });

  it('treats a null rowCount as zero inserted rows (?? branch)', async () => {
    mockQuery.mockResolvedValue({ rowCount: null });
    const before = (await eventsInsertedTotal.get()).values[0]?.value ?? 0;

    await insertEvents([
      {
        id: '3',
        service: 'checkout',
        eventType: 'order_failed',
        payload: null,
        timestamp: '2026-01-01T00:02:00.000Z',
      },
    ]);

    const after = (await eventsInsertedTotal.get()).values[0]?.value ?? 0;
    expect(after).toBe(before);
  });
});

describe('queryRecentEvents', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('maps rows to AnalyticsEvent shape and passes the limit through', async () => {
    const occurredAt = new Date('2026-01-01T00:00:00.000Z');
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: '1',
          service: 'checkout',
          event_type: 'order_placed',
          payload: '{"a":1}',
          occurred_at: occurredAt,
        },
      ],
    });

    const result = await queryRecentEvents(5);

    expect(mockQuery.mock.calls[0][1]).toEqual([5]);
    expect(result).toEqual([
      {
        id: '1',
        service: 'checkout',
        eventType: 'order_placed',
        payload: '{"a":1}',
        timestamp: occurredAt.toISOString(),
      },
    ]);
  });

  it('returns an empty array when there are no rows', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await queryRecentEvents(20);

    expect(result).toEqual([]);
  });
});
