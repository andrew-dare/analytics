const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/graphql';

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
