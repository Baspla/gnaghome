export * from '../platform/users/schema';
export * from '../platform/auth/schema';
// Legacy chat/permission tables remain declared so Drizzle does not interpret
// their removal from the active product as a request to drop persisted data.
export * from './legacy-chat-schema';
export * from './legacy-permission-schema';