import client from 'prom-client';

export const register = new client.Registry();

// Node process defaults: event loop lag, heap, GC, CPU.
client.collectDefaultMetrics({ register });

export const graphqlOperationDuration = new client.Histogram({
  name: 'graphql_operation_duration_seconds',
  help: 'GraphQL operation duration by operation name',
  labelNames: ['operation'] as const,
  registers: [register],
});

export const graphqlOperationErrors = new client.Counter({
  name: 'graphql_operation_errors_total',
  help: 'GraphQL operations that returned errors, by operation name',
  labelNames: ['operation'] as const,
  registers: [register],
});

export const producerSendDuration = new client.Histogram({
  name: 'kafka_producer_send_duration_seconds',
  help: 'Latency of producer.send — the critical path of the trackEvent mutation',
  registers: [register],
});

export const consumerBatchDuration = new client.Histogram({
  name: 'kafka_consumer_batch_duration_seconds',
  help: 'Time to process one Kafka batch (parse + insert + publish)',
  registers: [register],
});

export const consumerBatchSize = new client.Histogram({
  name: 'kafka_consumer_batch_size',
  help: 'Messages per consumed Kafka batch',
  buckets: [1, 5, 10, 25, 50, 100, 250, 500],
  registers: [register],
});

export const eventsConsumedTotal = new client.Counter({
  name: 'events_consumed_total',
  help: 'Events successfully parsed from the Kafka topic',
  registers: [register],
});

export const eventsUnparseableTotal = new client.Counter({
  name: 'events_unparseable_total',
  help: 'Kafka messages skipped because they could not be parsed (future DLQ rate)',
  registers: [register],
});

export const eventsInsertedTotal = new client.Counter({
  name: 'events_inserted_total',
  help: 'Rows actually inserted into Postgres (deduped replays excluded)',
  registers: [register],
});

export const consumerRebalancesTotal = new client.Counter({
  name: 'kafka_consumer_rebalances_total',
  help: 'Consumer group joins — a rising rate means crash-looping or session timeouts',
  registers: [register],
});

export const consumerCrashesTotal = new client.Counter({
  name: 'kafka_consumer_crashes_total',
  help: 'kafkajs consumer crash events (restarts are otherwise silent)',
  registers: [register],
});
