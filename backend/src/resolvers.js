import { v4 as uuidv4 } from 'uuid';
import { producer, TOPIC } from './kafka.js';
import { pubsub, EVENT_TRACKED } from './pubsub.js';
import { recentEvents } from './store.js';

export const resolvers = {
  Query: {
    recentEvents: (_parent, { limit = 20 }) => recentEvents.slice(0, limit),
  },
  Mutation: {
    trackEvent: async (_parent, { input }) => {
      const event = {
        id: uuidv4(),
        service: input.service,
        eventType: input.eventType,
        payload: input.payload ?? null,
        timestamp: new Date().toISOString(),
      };

      // Ingestion is fire-and-forget from the caller's perspective: the event
      // is accepted onto the Kafka topic and this resolver returns immediately.
      // Downstream processing (recentEvents store, subscriptions) happens
      // asynchronously via the consumer in index.js.
      await producer.send({
        topic: TOPIC,
        messages: [{ key: event.service, value: JSON.stringify(event) }],
      });

      return event;
    },
  },
  Subscription: {
    eventTracked: {
      subscribe: () => pubsub.asyncIterator([EVENT_TRACKED]),
    },
  },
};
