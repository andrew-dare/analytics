# TODO — kafka-analytics roadmap

From SDK design / GDPR / consent discussion (2026-07-14). Items are grouped by
workstream; rough order within each group is "do first → do later."

## 1. Ingestion API (prerequisite for the SDK)

- [ ] Add a plain HTTP `POST /v1/events` ingestion route alongside GraphQL
      (smaller client bundle, `sendBeacon`-compatible, easier to version);
      produce to the same `analytics-events` Kafka topic
- [ ] Accept batched event arrays in one request, not one request per event
- [ ] Version the wire format: include `sdkVersion` and `schemaVersion` in
      every event payload
- [ ] Issue per-customer **publishable write-only keys** (`pk_...` style) that
      identify the tenant and cannot read data
- [ ] Server-side per-key rate limiting and origin/allowlist validation
- [ ] Keep GraphQL for the query/dashboard side only

## 2. Core SDK (`@yourco/analytics-core`)

- [ ] Framework-agnostic core owning: event queue, batching, retries, transport
- [ ] Pre-load queue stub pattern (`window.yourco = window.yourco || []` +
      async script load, drain queue when real SDK arrives) — never block the
      host page
- [ ] Batch + flush on interval (e.g. every 5s or 20 events)
- [ ] Flush with `navigator.sendBeacon()` / `fetch(..., { keepalive: true })`
      on `visibilitychange` / `pagehide` so tab-close doesn't lose events
- [ ] `track()` returns immediately (resolve on *enqueue*, not server ack) —
      same fire-and-forget contract as the backend mutation
- [ ] Fail silently: never throw into the host app, no console spam,
      exponential backoff + jitter on retries, cap the buffer and drop rather
      than grow memory unboundedly
- [ ] Identity API surface (Segment-shaped, intentionally): `identify(userId,
      traits)`, `track(event, properties)`, `page()`
- [ ] Client-generated anonymous ID + server-side alias/merge step when an
      anonymous visitor logs in

### Bundle hygiene

- [ ] Ship ESM + CJS + minified IIFE (for the `<script>` tag)
- [ ] Zero runtime dependencies if possible; target < 10 kB gzipped core
- [ ] `"sideEffects": false`, TypeScript types included

## 3. Distribution wrappers

- [ ] `@yourco/analytics-react` — `<AnalyticsProvider>` + `useAnalytics()`
      hook, thin wrapper over core; `react` as a **peerDependency**
- [ ] Embeddable `<script>` snippet build of the same core for non-React sites
- [ ] Do **not** build two SDKs — both wrappers share the one core

## 4. Consent & privacy features in the SDK (design in from day one)

- [ ] Consent-aware mode: `init({ waitForConsent: true })` — buffer in memory
      or drop events until host calls `analytics.grantConsent()`
- [ ] Consent state as a first-class SDK concept (don't bolt on a "consent
      mode" later like Segment/Google had to)
- [ ] Cookieless operation mode as a fallback (Plausible/Fathom niche —
      no banner needed when no device identifiers are used)
- [ ] Respect **Global Privacy Control (GPC)** browser signal automatically
      (required under CCPA/CPRA, increasingly expected in the EU)

## 5. Backend GDPR readiness (before storing anything person-linked)

- [ ] Define and document **retention limits** for Kafka topics and the
      downstream store ("keep forever" is not acceptable)
- [ ] Design for **right to erasure / access** (Art. 17/15) now — options:
  - [ ] short topic retention + deletion handled in downstream store, or
  - [ ] key events by user + compacted topics with tombstones, or
  - [ ] crypto-shredding (per-user encryption key; delete key to "erase")
- [ ] Don't persist IP addresses (or truncate/hash at ingestion)
- [ ] Plan EU data residency / SCCs if serving EU users
- [x] Replace in-memory `recentEvents` store with a real database before any
      of the above matters — done: Postgres, batched idempotent inserts
- [ ] Time-partition the `events` table when volume grows (retention =
      dropping old partitions, not `DELETE`)
- [ ] Migrate hot analytics queries to **ClickHouse** when Postgres
      aggregations start hurting (the Plausible/PostHog path); keep the
      consumer as the single write path so the swap stays contained
- [ ] Pre-aggregate dashboard queries (rollup tables / materialized views)
      instead of scanning raw events per page load
- [ ] Split the Kafka consumer out of the API process into a separate
      worker container (independent scaling, deploys don't pause ingestion)
- [ ] Add a dead-letter topic (`analytics-events-dlq`) for unparseable /
      uninsertable events instead of skip-and-log

## 6. Telemetry / observability

- [x] Prometheus + Grafana + kafka-exporter in docker-compose, provisioned
      dashboard (lag, throughput, latency p95s, rebalances, pg pool)
- [x] Backend `/metrics` endpoint: prom-client + kafkajs instrumentation
      events + pg pool gauges + GraphQL operation histograms
- [x] Redpanda Console for browsing topics / consumer groups / lag
- [ ] Alerting rules (Prometheus Alertmanager or Grafana alerts): lag
      growing 5m, >3 rebalances/10m, API 5xx >1%, Kafka disk >80%,
      pg pool exhausted
- [ ] End-to-end freshness metric: `received_at` → row-visible-in-Postgres
      delay, exported as a histogram
- [ ] Produced-vs-inserted reconciliation counter (event loss detection
      beyond unparseable/DLQ)
- [ ] OpenTelemetry tracing across mutation → Kafka (trace context in
      message headers) → consumer → INSERT
- [ ] Broker JMX metrics via jmx-exporter when moving beyond one broker
      (under-replicated partitions, ISR shrink/expand, request latency)

## 7. Legal / paperwork (not code)

> Get real legal review before launch — the below is orientation, not advice.

- [ ] **DPA** (Data Processing Agreement) template for customers — they are
      controllers, we are the processor; process only per their instructions
- [ ] Privacy policy with Art. 13 transparency disclosures: what's collected,
      why, retention, user rights, processors used
- [ ] Consent is **never** buried in ToS (invalid under GDPR Art. 7) — it must
      be separate, explicit, granular, revocable
- [ ] For logged-in products: privacy-policy disclosure under legitimate
      interest for basic product analytics + account-settings opt-out toggle;
      explicit unbundled opt-in (unticked by default) for anything beyond
      functional analytics (marketing, profiling, third-party sharing)

## 8. Feature flagging & experimentation

- [ ] Add a **feature flagging service** — evaluate flags in both the
      frontend (gate UI like the Dashboard search/live-push rollout) and
      backend (gate resolver behavior); options range from hosted
      (LaunchDarkly, Statsig, GrowthBook Cloud) to self-hosted (GrowthBook,
      Unleash, Flagsmith) — self-hosted fits this project's "run everything
      in docker-compose" ethos better than a hosted-only choice
- [ ] Add an **experiment service** (A/B testing) — cohort assignment,
      exposure tracking, statistical significance on results; often the
      same product as the flag service above (GrowthBook and Statsig both
      bundle flags + experiments), so evaluate them together rather than
      picking two separate tools
- [ ] Route experiment exposure/conversion events through the *existing*
      event pipeline (`trackEvent` mutation → Kafka → Postgres) instead of
      a bolted-on system — this project already has the ingest/store/query
      path an experimentation system needs; a dedicated experiments table
      or `event_type` convention (e.g. `experiment_exposed`,
      `experiment_converted`) may be all that's required rather than new
      infrastructure

## Consent cheat-sheet (reference, not tasks)

| Scenario | Banner/consent needed? |
|---|---|
| No personal data at all (aggregate, no cookies, no IDs, no stored IPs) | No — largely outside GDPR scope |
| Anonymous visitor + analytics cookie/localStorage ID | **Yes** — prior opt-in (ePrivacy), EU visitors |
| Logged-in user, session cookie only | Session cookie itself is "strictly necessary" — no consent for it |
| Logged-in user + extra analytics device identifier | Consent required for the extra identifier |
| Logged-in user, analytics tied to account server-side (no extra device ID) | No ePrivacy trigger; needs GDPR legal basis (consent or legitimate interest) |

Key distinction: **ePrivacy** governs storing/reading anything on the device
(cookies, localStorage, fingerprinting — opt-in required unless strictly
necessary); **GDPR** governs processing personal data (needs a legal basis).
Pseudonymous IDs (random UUID in a cookie) still count as personal data.
