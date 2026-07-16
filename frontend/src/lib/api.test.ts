import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gql, RECENT_EVENTS_QUERY, TRACK_EVENT_MUTATION } from './api';

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
  });

  it('uses VITE_API_URL when set', async () => {
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
  });
});
