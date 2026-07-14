# kafka-analytics

A minimal example of the "third-party analytics service" pattern: other
services dispatch events to a GraphQL mutation, which writes them onto a
Kafka topic and returns immediately. A consumer in the same process reads
the topic asynchronously, populating an in-memory store and pushing
real-time updates to GraphQL subscribers — demonstrating how Kafka decouples
ingestion from processing behind the endpoint.

## Stack

- **Kafka** — single-broker, KRaft mode (no Zookeeper), `apache/kafka` image
- **Apollo Server 4** (Express + `graphql-ws` for subscriptions)
- **kafkajs** for the producer/consumer

## Run it

```bash
docker compose up --build
```

- GraphQL endpoint: http://localhost:4000/graphql
- Kafka broker (from host): localhost:9092

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
- `recentEvents` is in-memory and resets when the backend container
  restarts; swap `store.js` for a real database/warehouse write in the
  consumer loop to persist it.
- Topic `analytics-events` is auto-created on first publish (single
  partition, replication factor 1 — fine for local dev, not for production).
