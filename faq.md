# FAQ — backend internals

Answers to questions raised (as inline code comments) about how the Kafka
consumer, Apollo instrumentation, PubSub, and metrics pieces of the backend
actually work.

## `kafka.ts`

**What do the `GROUP_JOIN` / `CRASH` listeners do?**

They hook into kafkajs's internal instrumentation event bus. `GROUP_JOIN`
fires whenever this consumer (re)joins its group — on first startup, and
again on every rebalance (crash, restart, or scaling to more instances).
That's literally what a 28-second startup delay after a container restart
looks like — this counter firing once. `CRASH` fires because kafkajs
catches unhandled errors from `eachBatch` internally and silently restarts
the consumer loop rather than killing the process; without this listener
you'd never see that happen.

**What does `consumer.subscribe(...)` do?**

Registers this consumer group's interest in the topic. It doesn't start
pulling messages by itself — `consumer.run()` does that later.
`fromBeginning: false` means a brand-new consumer group starts at the
current tail (new events only) rather than replaying the whole topic from
offset 0.

**What happens if Kafka fails?**

Two cases. At startup, `connectKafka()`'s retry loop retries up to 15 times
over ~45s before giving up and `process.exit(1)`-ing via `main().catch(...)`
in `index.ts`. If Kafka drops *after* the backend is already running,
kafkajs's internal retry/backoff takes over on both sides independently —
`producer.send()` in the mutation starts throwing (surfaced to the caller),
and the consumer just stops receiving batches (lag grows, visible via
kafka-exporter).

## `pubsub.ts`

**What is the purpose of `PubSub`? Is this separate from Kafka?**

Yes, completely different job. `graphql-subscriptions`' `PubSub` is purely
in-process, in-memory fan-out to whatever WebSocket clients are connected
*right now*. Kafka is the durable backbone — it's what survives a restart
and can be replayed. `PubSub` has no persistence: publish with nobody
subscribed and it's just dropped. It also doesn't reach across processes —
if you ever ran two backend replicas, a client connected to instance B
wouldn't see events consumed by instance A. That's exactly why this is
called out in `TODO.md` as needing a real backend (Redis pub/sub) once the
consumer is split into its own worker.

## `metrics.ts`

**Why are histograms defined here, and separately in the Grafana dashboard?**

They're not duplicating the same thing — they're two ends of a pipe.
`metrics.ts` is where the histogram is actually populated: every request
calls `.observe()` (via `startTimer()`) and that data lives in the backend
process's memory, exposed as text at `/metrics`. The Grafana dashboard JSON
never touches this file; it only contains PromQL like
`histogram_quantile(0.95, rate(graphql_operation_duration_seconds_bucket[5m]))`
that queries Prometheus, which scraped and stored those buckets separately.
So: `metrics.ts` = what to measure, dashboard = how to query what's already
measured. The only coupling is that the metric *name* has to match between
the two.

## `index.ts`

**`async requestDidStart()` — does it return?**

Yes — it returns an object of nested hooks (`willSendResponse`,
`didEncounterErrors`) that Apollo calls at the corresponding later points in
that same request's lifecycle. `async` just means Apollo awaits it before
proceeding; this implementation happens to be synchronous inside.

**What is the purpose of `startTimer()`? Is it measuring GraphQL operation duration?**

Yes, exactly. It records the current time and returns a function; calling
that function later computes elapsed seconds and records one observation
into the histogram's buckets.

**Explain `endTimer(...)`**

That's calling the function `startTimer()` returned. Calling it both stops
the clock and records the duration, tagged with the `operation` label so
`trackEvent` and `recentEvents` show as separate series on the dashboard.
`willSendResponse` fires right before the response goes out, so
start-to-there captures the full request.

**Does `DrainHttpServer` wait for connections to finish, or kill them?**

It waits (graceful). When `server.stop()` is called, it stops accepting new
connections but lets in-flight requests finish before actually closing.
Caveat: this project doesn't wire up a `SIGTERM` handler to call
`server.stop()` yet, so today Docker just kills the process outright on
restart — this plugin is dormant until that's added.

**Is `/metrics` a stream? How does Prometheus use it?**

Plain request/response, not a stream. `register.metrics()` synchronously
renders every metric's current value into Prometheus's text format and
sends it as one body. Prometheus's scraper polls this URL via GET every 10s
(per `prometheus.yml`) and stores what it gets — the backend has no memory
of past scrapes, it just reports current state each time it's asked.

**Does the consumer read from the producer? Is the producer the mutation?**

The producer and consumer never talk directly; Kafka sits between them.
"The producer" *is* the `trackEvent` mutation's write path
(`producer.send()` in `resolvers.ts`) — it writes to the topic. The
consumer separately reads from Kafka's stored log, not from the producer
process. This is also why they can run at completely different speeds —
Kafka absorbs the gap.

**What is a batch? What defines its size?**

`eachBatch` hands the callback a chunk of consecutive messages from one
partition at once, instead of invoking per-message (that's `eachMessage`,
which was replaced specifically to get natural write batching for
Postgres). Size is bounded by kafkajs's `maxBytesPerPartition` (default
1MB) and `maxWaitTimeInMs` (default 5000ms) — whichever limit hits first.
At local test volume batches are typically 1-2 messages; under real load
they'd be much larger.

**Explain `eventsUnparseableTotal.inc()`**

Increments a counter each time a Kafka message fails `JSON.parse()`. It's a
data-quality signal — `increase(events_unparseable_total[10m])` is on the
dashboard, and per the TODO this is exactly what routes to a dead-letter
topic instead of log-and-drop once that's built.

**Does `insertEvents` write to the DB? Does it block `pubsub.publish`?**

Yes to both. It's one multi-row `INSERT ... ON CONFLICT DO NOTHING` for the
whole batch, and `await` means the `pubsub.publish` loop right after only
runs once that insert has actually completed. That ordering is intentional:
a subscription push is a guarantee the row is already durably in Postgres.

**Explain `eventsConsumedTotal.inc(events.length)`**

Increments by the batch's event count (not by 1). Tracks total volume
through the consumer; compared against `events_inserted_total` on the
dashboard to catch silent data loss beyond what unparseable messages
explain.

**What is the purpose of `pubsub.publish`? Is it to notify subscribers of new events?**

Yes, exactly right. It pushes the event under the `EVENT_TRACKED` key to
the in-memory PubSub; any client currently subscribed to `eventTracked`
gets it over its open WebSocket.

**What is the purpose of `await heartbeat()`?**

Tells the broker "I'm still alive, don't kick me out of the group." kafkajs
normally sends heartbeats on a background timer, but a long `eachBatch`
handler (ours does a DB write) can delay that. Skip too many heartbeats and
the broker assumes you died and triggers an unnecessary rebalance. Calling
it explicitly at the end of batch processing resets that clock.
