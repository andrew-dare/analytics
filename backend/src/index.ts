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
  // does async block return?
  async requestDidStart() {
    // what is the purpose of this startTimer? is it to measure the duration of the graphql operation?
    const endTimer = graphqlOperationDuration.startTimer();
    return {
      async willSendResponse(ctx) {
        // explain endtimer
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
    // will drainserver keep the server alive until all active connections are closed? or will it just close the server and let the connections die?
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

// is this a stream? how does prometheus use this endpoint?
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

  // consumer reads the data from the producer?
  // is the producer the graphQL mutation for sending analytic events?
  await consumer.run({
    // what is a batch?
    // what defines the size of a batch?
    eachBatch: async ({ batch, heartbeat }) => {
      const endTimer = consumerBatchDuration.startTimer();
      consumerBatchSize.observe(batch.messages.length);

      const events: AnalyticsEvent[] = [];
      for (const message of batch.messages) {
        if (!message.value) continue;
        try {
          events.push(JSON.parse(message.value.toString()) as AnalyticsEvent);
        } catch {
          // explain this next line
          eventsUnparseableTotal.inc();
          console.error(`Skipping unparseable message at offset ${message.offset}`);
        }
      }

      if (events.length > 0) {
        // is this writing to the database?
        // does this block pubsub.publish until write is complete?
        await insertEvents(events);
        // explain this line
        eventsConsumedTotal.inc(events.length);
        for (const event of events) {
          // what is the purpose of this pubsub.publish? is it to notify subscribers of new events? 
          pubsub.publish(EVENT_TRACKED, { eventTracked: event });
        }
      }

      // what is the purpose of this
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
