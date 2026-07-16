import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockProducerConnect, mockConsumerConnect, mockConsumerSubscribe, mockConsumerOn } =
  vi.hoisted(() => ({
    mockProducerConnect: vi.fn(),
    mockConsumerConnect: vi.fn(),
    mockConsumerSubscribe: vi.fn(),
    mockConsumerOn: vi.fn(),
  }));

vi.mock('kafkajs', () => {
  class Kafka {
    producer() {
      return { connect: mockProducerConnect };
    }
    consumer() {
      return {
        connect: mockConsumerConnect,
        subscribe: mockConsumerSubscribe,
        on: mockConsumerOn,
        events: { GROUP_JOIN: 'group_join', CRASH: 'crash' },
      };
    }
  }
  return { Kafka };
});

// Imported after the mock so kafka.ts's module-level Kafka(...) construction
// (and its `consumer.on(...)` registrations) run against the fake above.
const { connectKafka, consumer, TOPIC } = await import('./kafka.js');
const { consumerRebalancesTotal, consumerCrashesTotal } = await import('./metrics.js');

describe('connectKafka', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockProducerConnect.mockReset();
    mockConsumerConnect.mockReset();
    mockConsumerSubscribe.mockReset();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('connects on the first attempt and subscribes to the topic', async () => {
    mockProducerConnect.mockResolvedValue(undefined);
    mockConsumerConnect.mockResolvedValue(undefined);
    mockConsumerSubscribe.mockResolvedValue(undefined);

    await connectKafka(3, 0);

    expect(mockProducerConnect).toHaveBeenCalledOnce();
    expect(mockConsumerConnect).toHaveBeenCalledOnce();
    expect(mockConsumerSubscribe).toHaveBeenCalledWith({ topic: TOPIC, fromBeginning: false });
    expect(consoleLogSpy).toHaveBeenCalledWith('Connected to Kafka');
  });

  it('retries after an Error rejection and then succeeds', async () => {
    mockProducerConnect
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue(undefined);
    mockConsumerConnect.mockResolvedValue(undefined);
    mockConsumerSubscribe.mockResolvedValue(undefined);

    await connectKafka(3, 0);

    expect(mockProducerConnect).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Kafka not ready yet (attempt 1/3): connection refused'),
    );
  });

  it('retries after a non-Error rejection (String(err) branch)', async () => {
    mockProducerConnect.mockRejectedValueOnce('boom').mockResolvedValue(undefined);
    mockConsumerConnect.mockResolvedValue(undefined);
    mockConsumerSubscribe.mockResolvedValue(undefined);

    await connectKafka(3, 0);

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3): boom'));
  });

  it('throws after exhausting all retries', async () => {
    mockProducerConnect.mockRejectedValue(new Error('down'));

    await expect(connectKafka(2, 0)).rejects.toThrow(
      'Could not connect to Kafka after multiple retries',
    );

    expect(mockProducerConnect).toHaveBeenCalledTimes(2);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 1/2'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('attempt 2/2'));
  });
});

describe('consumer instrumentation', () => {
  it('registers a GROUP_JOIN handler that increments the rebalance counter', async () => {
    const before = (await consumerRebalancesTotal.get()).values[0]?.value ?? 0;
    const [, groupJoinHandler] = mockConsumerOn.mock.calls.find(
      ([event]) => event === consumer.events.GROUP_JOIN,
    )!;

    groupJoinHandler();

    const after = (await consumerRebalancesTotal.get()).values[0]?.value ?? 0;
    expect(after).toBe(before + 1);
  });

  it('registers a CRASH handler that increments the crash counter', async () => {
    const before = (await consumerCrashesTotal.get()).values[0]?.value ?? 0;
    const [, crashHandler] = mockConsumerOn.mock.calls.find(
      ([event]) => event === consumer.events.CRASH,
    )!;

    crashHandler();

    const after = (await consumerCrashesTotal.get()).values[0]?.value ?? 0;
    expect(after).toBe(before + 1);
  });
});
