# Gnaghome Backend

The backend uses Bun, Elysia, Eden Treaty, Drizzle, and SQLite. Better Auth provides OIDC-backed sessions.

Centrifugo is retained for realtime UI updates. It delivers typed platform-event envelopes to user-scoped channels; durable application state remains in SQLite and clients should refetch state after reconnects or missed events.

External-service integrations should own their provider-specific behavior and call shared platform services through explicit contracts. Resource authorization belongs in module-owned user-scoped operations. The authenticated user includes OIDC group memberships and a computed `isAdmin` derived from `GNAGHOME_ADMIN_GROUP`.

Backend code is organized by responsibility: `src/platform/` contains shared foundations (`auth`, `users`, and `realtime` today), `src/apps/` is the home for user-facing product domains, and `src/integrations/` is the home for provider connectors. See those directories' README files for ownership and dependency boundaries.

Legacy chat and permission table declarations remain registered with Drizzle to prevent accidental destructive migrations. They are not active backend modules; remove the legacy schema only as part of a deliberate data migration/retention decision.
