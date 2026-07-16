import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockSend, mockQueryRecentEvents } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockQueryRecentEvents: vi.fn(),
}));

vi.mock('./kafka.js', () => ({
  producer: { send: mockSend },
  TOPIC: 'analytics-events',
}));

vi.mock('./db.js', () => ({
  queryRecentEvents: mockQueryRecentEvents,
}));

const { resolvers } = await import('./resolvers.js');
const { producerSendDuration } = await import('./metrics.js');
const { pubsub, EVENT_TRACKED } = await import('./pubsub.js');

describe('Query.recentEvents', () => {
  beforeEach(() => {
    mockQueryRecentEvents.mockReset();
  });

  it('defaults limit to 20 when not provided', async () => {
    mockQueryRecentEvents.mockResolvedValue([]);

    await resolvers.Query.recentEvents({}, {});

    expect(mockQueryRecentEvents).toHaveBeenCalledWith(20);
  });

  it('passes through a custom limit', async () => {
    const events = [{ id: '1', service: 'a', eventType: 'b', payload: null, timestamp: 't' }];
    mockQueryRecentEvents.mockResolvedValue(events);

    const result = await resolvers.Query.recentEvents({}, { limit: 5 });

    expect(mockQueryRecentEvents).toHaveBeenCalledWith(5);
    expect(result).toBe(events);
  });
});

describe('Mutation.trackEvent', () => {
  let endTimerSpy: ReturnType<typeof vi.fn>;
  let startTimerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSend.mockReset();
    endTimerSpy = vi.fn();
    startTimerSpy = vi
      .spyOn(producerSendDuration, 'startTimer')
      .mockReturnValue(endTimerSpy as unknown as () => number);
  });

  afterEach(() => {
    startTimerSpy.mockRestore();
  });

  it('builds an event, sends it to Kafka, and returns it', async () => {
    mockSend.mockResolvedValue(undefined);

    const result = await resolvers.Mutation.trackEvent(
      {},
      { input: { service: 'checkout', eventType: 'order_placed', payload: '{"a":1}' } },
    );

    expect(result).toMatchObject({
      service: 'checkout',
      eventType: 'order_placed',
      payload: '{"a":1}',
    });
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
    expect(() => new Date(result.timestamp).toISOString()).not.toThrow();

    expect(mockSend).toHaveBeenCalledWith({
      topic: 'analytics-events',
      messages: [{ key: 'checkout', value: JSON.stringify(result) }],
    });
    expect(endTimerSpy).toHaveBeenCalledOnce();
  });

  it('defaults payload to null when omitted', async () => {
    mockSend.mockResolvedValue(undefined);

    const result = await resolvers.Mutation.trackEvent(
      {},
      { input: { service: 'checkout', eventType: 'order_placed' } },
    );

    expect(result.payload).toBeNull();
  });

  it('still stops the timer (finally) and propagates the error when send rejects', async () => {
    mockSend.mockRejectedValue(new Error('broker down'));

    await expect(
      resolvers.Mutation.trackEvent(
        {},
        { input: { service: 'checkout', eventType: 'order_placed' } },
      ),
    ).rejects.toThrow('broker down');

    expect(endTimerSpy).toHaveBeenCalledOnce();
  });
});

describe('Subscription.eventTracked', () => {
  it('yields published events to the subscriber', async () => {
    const iterator = resolvers.Subscription.eventTracked.subscribe();
    const nextPromise = iterator.next();

    const event = { id: '1', service: 'a', eventType: 'b', payload: null, timestamp: 't' };
    pubsub.publish(EVENT_TRACKED, { eventTracked: event });

    const { value, done } = await nextPromise;
    expect(done).toBe(false);
    expect(value).toEqual({ eventTracked: event });
  });
});
