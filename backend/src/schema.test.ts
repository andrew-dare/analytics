import { describe, it, expect } from 'vitest';
import { parse } from 'graphql';
import { typeDefs } from './schema.js';

describe('typeDefs', () => {
  it('is valid GraphQL SDL', () => {
    expect(() => parse(typeDefs)).not.toThrow();
  });

  it('declares the Event type, EventInput, and root operations', () => {
    expect(typeDefs).toContain('type Event');
    expect(typeDefs).toContain('input EventInput');
    expect(typeDefs).toContain('recentEvents(limit: Int = 20): [Event!]!');
    expect(typeDefs).toContain('trackEvent(input: EventInput!): Event!');
    expect(typeDefs).toContain('eventTracked: Event!');
  });
});
