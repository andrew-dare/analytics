export const typeDefs = `#graphql
  type Event {
    id: ID!
    service: String!
    eventType: String!
    payload: String
    timestamp: String!
  }

  input EventInput {
    service: String!
    eventType: String!
    payload: String
  }

  type Query {
    recentEvents(limit: Int = 20): [Event!]!
  }

  type Mutation {
    trackEvent(input: EventInput!): Event!
  }

  type Subscription {
    eventTracked: Event!
  }
`;
