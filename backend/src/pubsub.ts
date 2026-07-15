import { PubSub } from 'graphql-subscriptions';

// what is the purpose of PubSub?
// is this separate from kafka?
export const pubsub = new PubSub();
export const EVENT_TRACKED = 'EVENT_TRACKED';
