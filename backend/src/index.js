import express from 'express';
import http from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';

import { typeDefs } from './schema.js';
import { resolvers } from './resolvers.js';
import { connectKafka, consumer } from './kafka.js';
import { pubsub, EVENT_TRACKED } from './pubsub.js';
import { recentEvents } from './store.js';

const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();
const httpServer = http.createServer(app);

const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
const serverCleanup = useServer({ schema }, wsServer);

const server = new ApolloServer({
  schema,
  plugins: [
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

const PORT = process.env.PORT || 4000;

async function main() {
  await connectKafka();

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      recentEvents.unshift(event);
      if (recentEvents.length > 50) recentEvents.pop();
      pubsub.publish(EVENT_TRACKED, { eventTracked: event });
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
