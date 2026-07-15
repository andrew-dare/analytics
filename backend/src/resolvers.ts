import { v4 as uuidv4 } from 'uuid';
import { producer, TOPIC } from './kafka.js';
import { producerSendDuration } from './metrics.js';
import { pubsub, EVENT_TRACKED } from './pubsub.js';
import { queryRecentEvents } from './db.js';
import type { AnalyticsEvent, EventInput } from './types.js';

export const resolvers = {
  Query: {
    // explore using redis or other caching layer to store recent events, so we don't have to query the database every time.
    recentEvents: (
      _parent: unknown,
      { limit = 20 }: { limit?: number },
    ): Promise<AnalyticsEvent[]> => queryRecentEvents(limit),
  },
  Mutation: {
    trackEvent: async (
      _parent: unknown,
      { input }: { input: EventInput },
    ): Promise<AnalyticsEvent> => {
      const event: AnalyticsEvent = {
        id: uuidv4(),
        service: input.service,
        eventType: input.eventType,
        payload: input.payload ?? null,
        timestamp: new Date().toISOString(),
      };

      // Ingestion is fire-and-forget from the caller's perspective: the event
      // is accepted onto the Kafka topic and this resolver returns immediately.
      // Downstream processing (recentEvents store, subscriptions) happens
      // asynchronously via the consumer in index.ts.
      const endTimer = producerSendDuration.startTimer();
      try {
        await producer.send({
          topic: TOPIC,
          messages: [{ key: event.service, value: JSON.stringify(event) }],
        });
      } finally {
        endTimer();
      }

      return event;
    },
  },
  Subscription: {
    eventTracked: {
      subscribe: () => pubsub.asyncIterator([EVENT_TRACKED]),
    },
  },
};
