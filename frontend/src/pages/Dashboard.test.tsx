import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';
import { useAuth } from '../lib/AuthContext';
import { gql, RECENT_EVENTS_QUERY, TRACK_EVENT_MUTATION } from '../lib/api';
import type { AnalyticsEvent } from '../lib/api';

vi.mock('../lib/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, gql: vi.fn() };
});

const mockGql = vi.mocked(gql);

const EVENTS: AnalyticsEvent[] = [
  {
    id: '1',
    service: 'checkout',
    eventType: 'order_placed',
    payload: '{"orderId":1}',
    timestamp: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    service: 'auth',
    eventType: 'user_login',
    payload: null,
    timestamp: '2026-01-01T00:01:00.000Z',
  },
];

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'andrew@dare.dev' },
      isAuthenticated: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    mockGql.mockReset();
  });

  it('shows the empty state before any events load, then renders stats once loaded', async () => {
    mockGql.mockResolvedValue({ recentEvents: [] });
    renderDashboard();

    expect(
      await screen.findByText(
        'No events yet — emit a test event, or point a service at the trackEvent mutation.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // last event placeholder

    expect(mockGql).toHaveBeenCalledWith(RECENT_EVENTS_QUERY, { limit: 20 });
  });

  it('renders events, stats, and table rows once loaded', async () => {
    mockGql.mockResolvedValue({ recentEvents: EVENTS });
    const { container } = renderDashboard();

    await screen.findByText('checkout');

    const stats = container.querySelectorAll('.stat-value');
    expect(stats[0]).toHaveTextContent('2'); // recent events
    expect(stats[1]).toHaveTextContent('2'); // services seen

    const rows = screen.getAllByRole('row');
    // header row + 2 data rows
    expect(rows).toHaveLength(3);
    expect(screen.getByText('{"orderId":1}')).toBeInTheDocument();
    expect(screen.getByText('—', { selector: 'td' })).toBeInTheDocument(); // null payload
  });

  it('shows the offline banner and hides it once recovered', async () => {
    mockGql.mockRejectedValueOnce(new Error('network down'));
    renderDashboard();

    expect(
      await screen.findByText(/analytics backend isn't reachable/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emit test event' })).toBeDisabled();

    mockGql.mockResolvedValueOnce({ recentEvents: EVENTS });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(
      screen.queryByText(/analytics backend isn't reachable/),
    ).not.toBeInTheDocument();
  });

  it('polls again after POLL_MS and stops polling after unmount', async () => {
    mockGql.mockResolvedValue({ recentEvents: [] });
    const { unmount } = renderDashboard();

    await screen.findByText(
      'No events yet — emit a test event, or point a service at the trackEvent mutation.',
    );
    expect(mockGql).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockGql).toHaveBeenCalledTimes(2);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(mockGql).toHaveBeenCalledTimes(2);
  });

  it('filters the events table by search query (service or event type)', async () => {
    mockGql.mockResolvedValue({ recentEvents: EVENTS });
    vi.useRealTimers();
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('checkout');

    const search = screen.getByPlaceholderText('Search events…');
    await user.type(search, 'login');

    expect(screen.queryByText('checkout')).not.toBeInTheDocument();
    expect(screen.getByText('auth')).toBeInTheDocument();
  });

  it('shows a "no match" empty state distinct from the zero-events state', async () => {
    mockGql.mockResolvedValue({ recentEvents: EVENTS });
    vi.useRealTimers();
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByText('checkout');

    await user.type(screen.getByPlaceholderText('Search events…'), 'zzz_nothing');

    expect(await screen.findByText('No events match "zzz_nothing".')).toBeInTheDocument();
  });

  it('sends a test event, disables the button while sending, and re-polls after 800ms', async () => {
    mockGql.mockResolvedValue({ recentEvents: [] });
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    renderDashboard();

    await screen.findByText(
      'No events yet — emit a test event, or point a service at the trackEvent mutation.',
    );
    mockGql.mockClear();

    let resolveMutation!: () => void;
    mockGql.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve({});
        }),
    );

    const button = screen.getByRole('button', { name: 'Emit test event' });
    await user.click(button);

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(mockGql).toHaveBeenCalledWith(
      TRACK_EVENT_MUTATION,
      expect.objectContaining({
        input: expect.objectContaining({
          service: 'frontend',
          eventType: 'test_event',
          payload: JSON.stringify({ sentBy: 'andrew@dare.dev' }),
        }),
      }),
    );

    mockGql.mockResolvedValueOnce({ recentEvents: EVENTS });
    await act(async () => {
      resolveMutation();
      // Let the mutation's promise resolution flush before advancing past
      // the follow-up setTimeout(load, 800) it schedules.
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Emit test event' })).not.toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(mockGql).toHaveBeenCalledWith(RECENT_EVENTS_QUERY, { limit: 20 });
    expect(await screen.findByText('checkout')).toBeInTheDocument();
  });
});
