import { createClient } from 'graphql-ws';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/graphql';
const WS_URL = API_URL.replace(/^http/, 'ws');

export interface AnalyticsEvent {
  id: string;
  service: string;
  eventType: string;
  payload: string | null;
  timestamp: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`API responded ${res.status}`);
  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) throw new Error(json.errors[0].message);
  if (!json.data) throw new Error('Empty GraphQL response');
  return json.data;
}

export const RECENT_EVENTS_QUERY = /* GraphQL */ `
  query RecentEvents($limit: Int) {
    recentEvents(limit: $limit) {
      id
      service
      eventType
      payload
      timestamp
    }
  }
`;

export const TRACK_EVENT_MUTATION = /* GraphQL */ `
  mutation TrackEvent($input: EventInput!) {
    trackEvent(input: $input) {
      id
    }
  }
`;

export const EVENT_TRACKED_SUBSCRIPTION = /* GraphQL */ `
  subscription EventTracked {
    eventTracked {
      id
      service
      eventType
      payload
      timestamp
    }
  }
`;

const wsClient = createClient({ url: WS_URL });

// Subscribes to events pushed live over the eventTracked GraphQL
// subscription (Kafka consumer -> pubsub -> WebSocket). Returns an
// unsubscribe function. Note: the in-memory pubsub this rides on has no
// replay buffer, so events published while disconnected are missed —
// callers should still poll periodically to reconcile any gap.
export function subscribeToEvents(onEvent: (event: AnalyticsEvent) => void): () => void {
  return wsClient.subscribe<{ eventTracked: AnalyticsEvent }>(
    { query: EVENT_TRACKED_SUBSCRIPTION },
    {
      next: ({ data }) => {
        if (data?.eventTracked) onEvent(data.eventTracked);
      },
      error: (err) => {
        console.error('Event subscription error:', err);
      },
      complete: () => {},
    },
  );
}
