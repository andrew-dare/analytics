# kafka-analytics

A self-contained example of the "third-party analytics service" pattern:
client services dispatch events to a GraphQL mutation, which validates them,
writes them onto a Kafka topic, and returns immediately. A consumer reads
the topic asynchronously, persisting events to Postgres in idempotent
batches and pushing real-time updates to GraphQL subscribers. Kafka
decouples *receiving* an event from *processing* it — if processing is
slow or down, events queue up instead of being dropped, and history can be
replayed.

```
                    ┌─────────────────────── backend (Node/TS) ───────────────────────┐
                    │                                                                  │
 client services ──▶│  GraphQL mutation ──▶ producer.send ──▶ [ Kafka topic ]          │
                    │                                              │                   │
 dashboards ◀───────│  GraphQL query  ◀── Postgres ◀── batch INSERT ◀── consumer       │
 live feeds ◀───────│  GraphQL subscription ◀────── pubsub ◀──────────┘                │
                    │                                                                  │
                    │  /metrics ──▶ Prometheus ──▶ Grafana                              │
                    └──────────────────────────────────────────────────────────────────┘
```

## Stack

- **Kafka** — single broker, KRaft mode (no Zookeeper), `apache/kafka` image
- **Postgres 16** — persistence layer for consumed events
- **Apollo Server 5** — Express via `@as-integrations/express4`,
  subscriptions via `graphql-ws`; written in **TypeScript** (strict)
- **kafkajs** producer/consumer, **pg** for Postgres, **prom-client** for metrics
- **Clerk** (`@clerk/react`) — authentication; custom UI (not the prebuilt
  `<SignIn/>`), so sign-in/sign-up run through the poster-styled form
- **Prometheus + Grafana + kafka-exporter** for telemetry,
  **Redpanda Console** and **pgweb** as data GUIs
- **yarn** as the package manager

## Run it

Frontend auth needs a Clerk app first (free at [clerk.com](https://clerk.com)):

```bash
cd frontend
cp .env.example .env
# then set VITE_CLERK_PUBLISHABLE_KEY in .env to your app's publishable key
```

Without this, the frontend renders a "Clerk isn't configured" message instead
of crashing, but sign-in won't work.

```bash
docker compose up --build
```

### Services & ports

| Service | URL / address | Notes |
|---|---|---|
| Frontend (Bupis) | http://localhost:5173 | nginx-served production build; for HMR dev, stop the container and run `yarn dev` in `frontend/` |
| GraphQL API | http://localhost:4000/graphql | Apollo Sandbox in the browser; WS subscriptions on the same path |
| Backend metrics | http://localhost:4000/metrics | Prometheus exposition format |
| Kafka broker | `localhost:9092` | from the host; containers use `kafka:19092` |
| Postgres | `localhost:5432` | user / password / db all `analytics` |
| pgweb (Postgres GUI) | http://localhost:8081 | auto-connects; browse `events` or run SQL |
| Redpanda Console (Kafka GUI) | http://localhost:8082 | topics, messages, consumer groups & lag |
| Prometheus | http://localhost:9090 | scrapes backend + kafka-exporter every 10s |
| Grafana | http://localhost:3001 | anonymous access; dashboard auto-provisioned |

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

Read recently processed events (query — served from Postgres, populated by
the Kafka consumer):

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

Watch events arrive in real time (subscription, over `graphql-ws`):

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

## How it works

**Ingestion is fire-and-forget from the caller's perspective.** The
`trackEvent` mutation waits only for the Kafka `producer.send`
acknowledgment — not for processing — and returns. This is the same shape
as the ingestion endpoint of a real analytics pipeline.

**Persistence is batched and idempotent.** The consumer uses kafkajs
`eachBatch`: one multi-row `INSERT` per Kafka batch, with
`ON CONFLICT (id) DO NOTHING`. Offsets commit only after the handler
resolves, so a crash before the insert means redelivery, not data loss —
and the dedup makes Kafka's at-least-once redelivery effectively
exactly-once in the database. Events survive backend restarts.

**Two timestamps per event.** The client-reported `occurred_at` and the
server-side `received_at` are both stored — client clocks lie.

**Topic `analytics-events`** is auto-created on first publish (single
partition, replication factor 1 — fine for local dev, not production).

**Unparseable messages** are counted and skipped (a proper dead-letter
topic is on the roadmap).

**Auth is Clerk, wrapped behind a thin adapter.** `frontend/src/lib/AuthContext.tsx`
exposes `{ user, isAuthenticated, isLoaded, signOut }` over Clerk's own
`useAuth`/`useUser` hooks, so the rest of the app (`Sidebar`, `NavBar`,
`ProtectedRoute`, ...) doesn't know Clerk exists. Sign-in and sign-up
themselves bypass that adapter and use Clerk's `useSignIn`/`useSignUp`
directly in `Login.tsx`, since those are multi-step flows (email
verification is on by default for sign-up) rather than a single
`signIn(email, password)` call. `ClerkProvider` lives in `main.tsx`, not
`App.tsx` — nothing below main needs to know about it either.

## Observability

Backend instrumentation ([backend/src/metrics.ts](backend/src/metrics.ts)):

- GraphQL operation duration & error counts (Apollo plugin, per operation)
- `producer.send` latency — the mutation's critical path
- Consumer batch duration & size; consumed / inserted / unparseable counters
- Consumer group rebalances and crashes (kafkajs instrumentation events)
- `pg` pool gauges (total / idle / waiting) and Node process defaults
  (event loop lag, heap, GC)

Cluster-side Kafka metrics come from **kafka-exporter**; the headline
metric is **consumer group lag** (`kafka_consumergroup_lag`): growing lag
means processing is falling behind ingestion.

Grafana auto-provisions the **"Kafka Analytics Pipeline"** dashboard
(consumer lag, produce/consume/insert rates, latency p95s, rebalances &
crashes, pg pool, event loop lag) from
[monitoring/grafana/dashboards](monitoring/grafana/dashboards).

## Local development (backend only)

```bash
cd backend
yarn install
yarn dev      # tsx watch, runs src/index.ts directly, no build step
yarn build    # compiles src/ -> dist/ with tsc
yarn start    # runs the compiled dist/index.js
```

`yarn dev` expects Kafka at `KAFKA_BROKER` and Postgres at `DATABASE_URL`
(defaults target the compose network); when running the backend outside
Docker, start the infra with `docker compose up kafka postgres` and set:

```bash
KAFKA_BROKER=localhost:9092 \
DATABASE_URL=postgres://analytics:analytics@localhost:5432/analytics \
yarn dev
```

## Testing

Both projects use [Vitest](https://vitest.dev). Test files live next to the
code as `*.test.ts` / `*.test.tsx`.

```bash
cd frontend   # or backend
yarn test           # run once
yarn test:watch     # watch mode
yarn test:coverage  # run with coverage + enforce thresholds
```

- **Frontend** — jsdom environment with
  [Testing Library](https://testing-library.com) (`@testing-library/react`,
  `user-event`) and `jest-dom` matchers, wired up in `src/test/setup.ts`.
- **Backend** — Node environment; unit tests for the pure modules.
- Test files import `describe`/`it`/`expect`/`vi` explicitly from `vitest`
  (no ambient globals).

### Coverage

`yarn test:coverage` enforces **100%** on lines, functions, branches, and
statements (v8 provider). CI runs this on every PR. Two bootstrap files are
excluded from coverage because they wire everything together and are
exercised by the running app rather than unit tests:

- `frontend/src/main.tsx` — React render entry
- `backend/src/index.ts` — server composition root (Kafka + Postgres +
  Apollo + WebSockets)

### CI

`.github/workflows/ci.yml` runs on every pull request. A path filter detects
whether `frontend/` and/or `backend/` changed and runs only the affected
suite(s); an aggregating `CI` job provides a single status to require in
branch protection (it passes when no suite failed — an untouched, skipped
suite doesn't block the merge).

## Project layout

```
backend/
  src/
    index.ts      # Express + Apollo + WS server, Kafka consumer loop
    schema.ts     # GraphQL typeDefs
    resolvers.ts  # trackEvent / recentEvents / eventTracked
    kafka.ts      # kafkajs client, producer, consumer, topic
    db.ts         # pg pool, schema init, batched inserts, queries
    metrics.ts    # prom-client registry and all custom metrics
    pubsub.ts     # in-process pubsub for subscriptions
    types.ts      # shared event types
  vitest.config.ts
frontend/
  src/
    pages/        # Home, Login, Dashboard
    components/   # NavBar, Sidebar, AppTopbar, ProtectedRoute
    lib/          # AuthContext, GraphQL api client
    test/setup.ts # jest-dom matchers + RTL cleanup
  vite.config.ts  # Vite build + Vitest config
monitoring/
  prometheus/     # scrape config
  grafana/        # provisioned datasource + dashboard
.github/
  workflows/
    ci.yml        # path-filtered test suites, 100% coverage gate
docker-compose.yml
TODO.md           # roadmap: SDK design, consent/GDPR readiness, telemetry
```

## Roadmap

See [TODO.md](TODO.md) — notable next steps: HTTP `POST /v1/events`
ingestion route + embeddable JS/React SDK, consent-aware tracking &
GDPR erasure strategy, alerting rules, a dead-letter topic, splitting the
consumer into its own worker container, and a ClickHouse migration path
when Postgres aggregations stop scaling.
