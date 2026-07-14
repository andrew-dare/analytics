export interface AnalyticsEvent {
  id: string;
  service: string;
  eventType: string;
  payload: string | null;
  timestamp: string;
}

export interface EventInput {
  service: string;
  eventType: string;
  payload?: string | null;
}
