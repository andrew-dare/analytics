import express from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import { ApolloServer } from '@apollo/server';
import type { ApolloServerPlugin } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';

import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { connectKafka, consumer } from './kafka.js';
import { pubsub, EVENT_TRACKED } from './pubsub.js';
import { initDb, insertEvents } from './db.js';
import {
  register,
  graphqlOperationDuration,
  graphqlOperationErrors,
  consumerBatchDuration,
  consumerBatchSize,
  eventsConsumedTotal,
  eventsUnparseableTotal,
} from './metrics.js';
import type { AnalyticsEvent } from './types.js';

const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();
const httpServer = http.createServer(app);

const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
const serverCleanup = useServer({ schema }, wsServer);

const metricsPlugin: ApolloServerPlugin = {
  async requestDidStart() {
    const endTimer = graphqlOperationDuration.startTimer();
    return {
      async willSendResponse(ctx) {
        endTimer({ operation: ctx.operationName ?? 'anonymous' });
      },
      async didEncounterErrors(ctx) {
        graphqlOperationErrors.inc({ operation: ctx.operationName ?? 'anonymous' });
      },
    };
  },
};

const server = new ApolloServer({
  schema,
  plugins: [
    metricsPlugin,
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();

app.use('/graphql', cors(), bodyParser.json(), expressMiddleware(server));

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

const PORT = Number(process.env.PORT) || 4000;

async function main(): Promise<void> {
  await initDb();
  await connectKafka();

  // eachBatch gives natural write batching: one multi-row INSERT per Kafka
  // batch, and offsets are only committed after the batch handler resolves —
  // so a crash before the INSERT lands means redelivery, not data loss.
  await consumer.run({
    eachBatch: async ({ batch, heartbeat }) => {
      const endTimer = consumerBatchDuration.startTimer();
      consumerBatchSize.observe(batch.messages.length);

      const events: AnalyticsEvent[] = [];
      for (const message of batch.messages) {
        if (!message.value) continue;
        try {
          events.push(JSON.parse(message.value.toString()) as AnalyticsEvent);
        } catch {
          eventsUnparseableTotal.inc();
          console.error(`Skipping unparseable message at offset ${message.offset}`);
        }
      }

      if (events.length > 0) {
        await insertEvents(events);
        eventsConsumedTotal.inc(events.length);
        for (const event of events) {
          pubsub.publish(EVENT_TRACKED, { eventTracked: event });
        }
      }

      await heartbeat();
      endTimer();
    },
  });

  httpServer.listen(PORT, () => {
    console.log(`Apollo GraphQL server ready at http://localhost:${PORT}/graphql`);
    console.log(`Subscriptions ready at ws://localhost:${PORT}/graphql`);
  });
}

main().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
