import pg from 'pg';
import type { AnalyticsEvent } from './types.js';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://analytics:analytics@postgres:5432/analytics',
});

export async function initDb(retries = 15, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS events (
          id uuid PRIMARY KEY,
          service text NOT NULL,
          event_type text NOT NULL,
          payload text,
          occurred_at timestamptz NOT NULL,
          received_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await pool.query(
        'CREATE INDEX IF NOT EXISTS events_occurred_at_idx ON events (occurred_at DESC)',
      );
      await pool.query(
        'CREATE INDEX IF NOT EXISTS events_service_occurred_at_idx ON events (service, occurred_at DESC)',
      );
      console.log('Connected to Postgres');
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Postgres not ready yet (attempt ${attempt}/${retries}): ${message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Could not connect to Postgres after multiple retries');
}

export async function insertEvents(events: AnalyticsEvent[]): Promise<void> {
  if (events.length === 0) return;

  const values: unknown[] = [];
  const rows = events.map((event, i) => {
    const base = i * 5;
    values.push(event.id, event.service, event.eventType, event.payload, event.timestamp);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  // Kafka delivers at-least-once: after a consumer crash the same messages
  // can be redelivered. Deduping on the event id makes replays a no-op, so
  // persistence is effectively exactly-once.
  await pool.query(
    `INSERT INTO events (id, service, event_type, payload, occurred_at)
     VALUES ${rows.join(', ')}
     ON CONFLICT (id) DO NOTHING`,
    values,
  );
}

export async function queryRecentEvents(limit: number): Promise<AnalyticsEvent[]> {
  const { rows } = await pool.query(
    `SELECT id, service, event_type, payload, occurred_at
     FROM events
     ORDER BY occurred_at DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((row) => ({
    id: row.id,
    service: row.service,
    eventType: row.event_type,
    payload: row.payload,
    timestamp: row.occurred_at.toISOString(),
  }));
}
