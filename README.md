# kafka-analytics

A minimal example of the "third-party analytics service" pattern: other
services dispatch events to a GraphQL mutation, which writes them onto a
Kafka topic and returns immediately. A consumer in the same process reads
the topic asynchronously, persisting events to Postgres in batches and
pushing real-time updates to GraphQL subscribers — demonstrating how Kafka
decouples ingestion from processing behind the endpoint.

## Stack

- **Kafka** — single-broker, KRaft mode (no Zookeeper), `apache/kafka` image
- **Postgres 16** — persistence layer for consumed events
- **Apollo Server 5** (Express via `@as-integrations/express4` + `graphql-ws` for subscriptions), written in **TypeScript**
- **kafkajs** for the producer/consumer, **pg** for Postgres
- **yarn** as the package manager

## Run it

```bash
docker compose up --build
```

- GraphQL endpoint: http://localhost:4000/graphql
- Kafka broker (from host): localhost:9092
- Postgres (from host): localhost:5432, user/password/db all `analytics`

## Local development (backend only)

```bash
cd backend
yarn install
yarn dev      # tsx watch, runs src/index.ts directly, no build step
yarn build    # compiles src/ -> dist/ with tsc
yarn start    # runs the compiled dist/index.js
```

`yarn dev` expects Kafka reachable at `KAFKA_BROKER` (defaults to
`kafka:19092`); run `docker compose up kafka` separately and set
`KAFKA_BROKER=localhost:9092` if working on the backend outside Docker.

## Try it

Send an event (mutation):

```graphql
mutation {
  trackEvent(input: { service: "checkout", eventType: "order_placed", payload: "{\"orderId\":123}" }) {
    id
    service
    eventType
    timestamp
  }
}
```

Read recently processed events (query, populated by the Kafka consumer):

```graphql
query {
  recentEvents(limit: 10) {
    id
    service
    eventType
    timestamp
  }
}
```

Watch events arrive in real time (subscription):

```graphql
subscription {
  eventTracked {
    id
    service
    eventType
    timestamp
  }
}
```

Open http://localhost:4000/graphql in a browser for Apollo Sandbox, or use
any GraphQL client that supports `graphql-ws` for the subscription.

## Notes

- The `trackEvent` mutation only waits for the Kafka `producer.send`
  acknowledgment, not for processing — this is the same shape as an
  ingestion endpoint in front of a real analytics pipeline.
- Consumed events are persisted to Postgres (`events` table) with one
  multi-row `INSERT` per Kafka batch and `ON CONFLICT (id) DO NOTHING`
  dedup, so Kafka's at-least-once redelivery is effectively exactly-once
  in the database. Events survive backend restarts.
- Both the client-reported time (`occurred_at`) and the server ingestion
  time (`received_at`) are stored — client clocks lie.
- Topic `analytics-events` is auto-created on first publish (single
  partition, replication factor 1 — fine for local dev, not for production).
