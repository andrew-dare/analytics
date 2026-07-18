import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Sink } from 'graphql-ws';

const { mockSubscribe, mockCreateClient } = vi.hoisted(() => {
  const mockSubscribe = vi.fn();
  return { mockSubscribe, mockCreateClient: vi.fn(() => ({ subscribe: mockSubscribe })) };
});

vi.mock('graphql-ws', () => ({
  createClient: mockCreateClient,
}));

import {
  gql,
  RECENT_EVENTS_QUERY,
  TRACK_EVENT_MUTATION,
  EVENT_TRACKED_SUBSCRIPTION,
  subscribeToEvents,
  type AnalyticsEvent,
} from './api';

describe('gql', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the query/variables and returns data on success', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { recentEvents: [] } }),
    } as Response);

    const data = await gql<{ recentEvents: unknown[] }>(RECENT_EVENTS_QUERY, { limit: 20 });

    expect(data).toEqual({ recentEvents: [] });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: RECENT_EVENTS_QUERY, variables: { limit: 20 } }),
      }),
    );
  });

  it('throws when the HTTP response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(gql(TRACK_EVENT_MUTATION)).rejects.toThrow('API responded 500');
  });

  it('throws the first GraphQL error message when errors are present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'boom' }, { message: 'second' }] }),
    } as Response);

    await expect(gql(RECENT_EVENTS_QUERY)).rejects.toThrow('boom');
  });

  it('throws when the response has no data and no errors', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    await expect(gql(RECENT_EVENTS_QUERY)).rejects.toThrow('Empty GraphQL response');
  });
});

describe('API_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('falls back to localhost:4000 when VITE_API_URL is unset', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    } as Response));
    vi.resetModules();

    const { gql: freshGql } = await import('./api');
    await freshGql('query {}');

    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/graphql', expect.anything());
    expect(mockCreateClient).toHaveBeenLastCalledWith({ url: 'ws://localhost:4000/graphql' });
  });

  it('uses VITE_API_URL when set, deriving a matching wss:// URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://example.com/graphql');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: {} }),
    } as Response));
    vi.resetModules();

    const { gql: freshGql } = await import('./api');
    await freshGql('query {}');

    expect(fetch).toHaveBeenCalledWith('https://example.com/graphql', expect.anything());
    expect(mockCreateClient).toHaveBeenLastCalledWith({ url: 'wss://example.com/graphql' });
  });
});

describe('subscribeToEvents', () => {
  const EVENT: AnalyticsEvent = {
    id: '1',
    service: 'checkout',
    eventType: 'order_placed',
    payload: null,
    timestamp: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    mockSubscribe.mockReset();
  });

  it('subscribes with the eventTracked query and forwards pushed events', () => {
    const unsubscribeFn = vi.fn();
    let sink!: Sink<{ data?: { eventTracked?: AnalyticsEvent } }>;
    mockSubscribe.mockImplementation((_payload, s) => {
      sink = s;
      return unsubscribeFn;
    });
    const onEvent = vi.fn();

    const unsubscribe = subscribeToEvents(onEvent);

    expect(mockSubscribe).toHaveBeenCalledWith(
      { query: EVENT_TRACKED_SUBSCRIPTION },
      expect.objectContaining({
        next: expect.any(Function),
        error: expect.any(Function),
        complete: expect.any(Function),
      }),
    );
    expect(unsubscribe).toBe(unsubscribeFn);

    sink.next({ data: { eventTracked: EVENT } });
    expect(onEvent).toHaveBeenCalledWith(EVENT);
  });

  it('does not call onEvent when a pushed message has no eventTracked data', () => {
    let sink!: Sink<{ data?: { eventTracked?: AnalyticsEvent } }>;
    mockSubscribe.mockImplementation((_payload, s) => {
      sink = s;
      return vi.fn();
    });
    const onEvent = vi.fn();

    subscribeToEvents(onEvent);
    sink.next({ data: undefined });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('logs subscription errors instead of throwing', () => {
    let sink!: Sink<{ data?: { eventTracked?: AnalyticsEvent } }>;
    mockSubscribe.mockImplementation((_payload, s) => {
      sink = s;
      return vi.fn();
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    subscribeToEvents(vi.fn());
    expect(() => sink.error(new Error('ws down'))).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Event subscription error:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('has a no-op complete handler', () => {
    let sink!: Sink<{ data?: { eventTracked?: AnalyticsEvent } }>;
    mockSubscribe.mockImplementation((_payload, s) => {
      sink = s;
      return vi.fn();
    });

    subscribeToEvents(vi.fn());

    expect(() => sink.complete()).not.toThrow();
  });
});
