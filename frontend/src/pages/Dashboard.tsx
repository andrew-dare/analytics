import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import Sidebar from '../components/Sidebar';
import AppTopbar from '../components/AppTopbar';
import {
  gql,
  RECENT_EVENTS_QUERY,
  TRACK_EVENT_MUTATION,
  subscribeToEvents,
  type AnalyticsEvent,
} from '../lib/api';

// New events arrive live over the eventTracked WebSocket subscription; this
// interval is a fallback reconciliation poll only. The in-memory pubsub
// behind the subscription has no replay buffer, so any events published
// while disconnected are simply missed — this poll re-syncs from Postgres
// periodically to correct for that, rather than being the primary update
// mechanism.
const RECONCILE_MS = 30000;
const MAX_EVENTS = 20;

export default function Dashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await gql<{ recentEvents: AnalyticsEvent[] }>(RECENT_EVENTS_QUERY, {
        limit: MAX_EVENTS,
      });
      setEvents(data.recentEvents);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  // Initial load, then a slow reconciliation poll — see RECONCILE_MS above.
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), RECONCILE_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Live updates: prepend newly tracked events as they're pushed over the
  // subscription, deduping against anything already in state (the same
  // event can otherwise arrive twice — once from the reconciliation poll,
  // once pushed live).
  useEffect(() => {
    return subscribeToEvents((event) => {
      setEvents((prev) => {
        if (prev.some((e) => e.id === event.id)) return prev;
        return [event, ...prev].slice(0, MAX_EVENTS);
      });
    });
  }, []);

  const sendTestEvent = async () => {
    setSending(true);
    try {
      await gql(TRACK_EVENT_MUTATION, {
        input: {
          service: 'frontend',
          eventType: 'test_event',
          payload: JSON.stringify({ sentBy: user?.email }),
        },
      });
      // The new event arrives live via the eventTracked subscription once
      // Kafka processing completes — no need to guess a re-poll delay.
    } finally {
      setSending(false);
    }
  };

  const services = new Set(events.map((e) => e.service));
  const lastEvent = events[0];

  const query = search.trim().toLowerCase();
  const filteredEvents = query
    ? events.filter(
        (e) => e.service.toLowerCase().includes(query) || e.eventType.toLowerCase().includes(query),
      )
    : events;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <AppTopbar search={search} onSearchChange={setSearch} />
        <div className="dash">
          <section className="dash-greeting">
            <p className="kicker">you are signed in</p>
            <h1>
              Welcome to <em>your data</em>.
            </h1>
          </section>

          {offline && (
            <p className="dash-offline">
              The analytics backend isn't reachable at localhost:4000 — start it with
              `docker compose up` and this page will recover on its own.
            </p>
          )}

          <div className="dash-stats">
            <div className="stat">
              <div className="stat-value">{events.length}</div>
              <div className="stat-label">recent events</div>
            </div>
            <div className="stat">
              <div className="stat-value">{services.size}</div>
              <div className="stat-label">services seen</div>
            </div>
            <div className="stat">
              <div className="stat-value">
                {lastEvent ? new Date(lastEvent.timestamp).toLocaleTimeString() : '—'}
              </div>
              <div className="stat-label">last event</div>
            </div>
          </div>

          <div className="dash-section-head">
            <h2>Recent events</h2>
            <button
              type="button"
              className="btn"
              onClick={sendTestEvent}
              disabled={sending || offline}
            >
              {sending ? 'Sending…' : 'Emit test event'}
            </button>
          </div>

          {filteredEvents.length === 0 && !offline ? (
            <p className="dash-empty">
              {events.length === 0
                ? 'No events yet — emit a test event, or point a service at the trackEvent mutation.'
                : `No events match "${search}".`}
            </p>
          ) : (
            <table className="events-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Event type</th>
                  <th>Payload</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event) => (
                  <tr key={event.id}>
                    <td className="mono">{event.service}</td>
                    <td className="mono">{event.eventType}</td>
                    <td>{event.payload ?? '—'}</td>
                    <td>{new Date(event.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
