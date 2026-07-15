import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import Sidebar from '../components/Sidebar';
import {
  gql,
  RECENT_EVENTS_QUERY,
  TRACK_EVENT_MUTATION,
  type AnalyticsEvent,
} from '../lib/api';

const POLL_MS = 5000;

export default function Dashboard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await gql<{ recentEvents: AnalyticsEvent[] }>(RECENT_EVENTS_QUERY, {
        limit: 20,
      });
      setEvents(data.recentEvents);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  // explain how this works
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

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
      // Small delay so the consumer has a chance to persist before we re-poll.
      setTimeout(() => void load(), 800);
    } finally {
      setSending(false);
    }
  };

  const services = new Set(events.map((e) => e.service));
  const lastEvent = events[0];

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
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

          {events.length === 0 && !offline ? (
            <p className="dash-empty">
              No events yet — emit a test event, or point a service at the trackEvent mutation.
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
                {events.map((event) => (
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
