import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'analytics-backend',
  brokers: [process.env.KAFKA_BROKER || 'kafka:19092'],
  retry: { initialRetryTime: 1000, retries: 15 },
});

export const producer = kafka.producer();
export const consumer = kafka.consumer({ groupId: 'analytics-consumer-group' });
export const TOPIC = 'analytics-events';

export async function connectKafka(retries = 15, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await producer.connect();
      await consumer.connect();
      await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
      console.log('Connected to Kafka');
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`Kafka not ready yet (attempt ${attempt}/${retries}): ${message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Could not connect to Kafka after multiple retries');
}
