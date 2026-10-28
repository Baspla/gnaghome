# Unified dashboard: architecture memory

**Status:** Direction agreed in conversation; this is a high-level proposal, not an implementation specification. Update it when the product direction changes.

## Product direction

Gnaghome is moving away from being a chat and voice application. The intended product is a unified dashboard that brings together different services (initial examples: Steam, Discord, and Minecraft) that are currently separate. The goal is a small, self-hostable application for a known group, not a large public multi-tenant platform.

## Keep, cut, and add

### Keep as foundations

- OIDC sign-in with Better Auth and the app's local user identity/profile.
- The current Bun workspace, SvelteKit/Svelte 5, Elysia, Drizzle, SQLite, shared TypeScript contracts, and existing test setup.
- The modular backend and dependency-injected service composition; keep it a modular monolith for now.
- Centrifugo for realtime updates to connected frontend clients.
- Useful, non-chat-specific UI shell, theme, preferences, deployment, and reusable components where they remain appropriate.

### Retire from the product

- Chat rooms/channels, DMs, messages, read state, and chat-specific routes, stores, and UI.
- LiveKit voice/VoIP, voice state, webhooks, and voice-specific client/backend code.
- Chat-shaped websocket events/DTOs and channel-specific permission concepts.

Retiring a feature does not imply immediately dropping its database tables. Preserve migration history and user data; plan any destructive cleanup separately, with backups and a deliberate migration.

### Add as shared platform capabilities

- A shared authenticated-user context and conventions for module-owned authorization checks.
- Linked external-service accounts, kept distinct from OIDC login accounts.
- A central feed of app-generated activity, with entries referencing the originating app objects and access governed by those apps.
- A durable audit log of changes across apps and platform systems, including create/update/delete actions. This is separate from social feed and provider activity; only admins may read audit records, with authorization enforced by the backend.
- Durable normalized activity collected from external services for consumers such as Stats; this is distinct from app-generated feed events.
- Notifications, comments and reactions on supported dashboard items, and a shared media/upload service as concrete use cases require them. When an object appears in the feed and on its app page, both views use the same canonical comments and reactions rather than separate copies.
- A persistent background-job mechanism for provider polling/sync, retries, upload processing, and related asynchronous work.

## Backend organization

Keep the backend as one modular monolith, but make the roles of its modules visible in the source tree:

```text
backend/src/
  platform/       # Shared foundations used across product areas
    auth/
    users/
    realtime/     # Centrifugo transport and platform event delivery
    media/        # Add when shared upload/storage use cases arrive
    comments/     # Add when shared commenting use cases arrive
    notifications/
    jobs/
  apps/           # User-facing dashboard areas; each owns its data and rules
    photos/
    literature/
    calendar/
  integrations/   # External provider connectors and provider-owned data
    steam/
    discord/
    minecraft/
```

The current active modules have been grouped under `platform/auth`, `platform/users`, and `platform/realtime`. The Realtime module retains the existing `/gateway` API prefix for compatibility. The `apps/` and `integrations/` directories contain boundary guidance for future modules; create a feature directory there when a real app or connector is added, not as an empty framework in advance. A product area such as Photos owns photo/album behavior and its authorization, while shared Media infrastructure owns reusable upload/storage mechanics. Integrations contribute through explicit contracts and must not write directly into app-owned tables. These are source-code boundaries inside one deployment, not separate services or a plugin framework.

## Integration and data boundaries

Each provider integration owns its API calls, credential handling, rate limits, cursors, and provider-specific records. Integrations contribute normalized external activity or request notifications through explicit platform services/contracts; they do not write directly into another module's tables. App-generated feed events are a separate source of activity: apps publish them through a platform contract, and feed entries reference app-owned objects rather than replacing or duplicating those objects. Audit records are a separate administrative trail of changes; app and platform operations should record relevant create/update/delete actions through a shared contract, and audit-log reads must be restricted to admins by backend authorization.

Model externally collected activity with a small common envelope (for example: actor, source/provider, event type, occurred-at time, and a reference or validated payload for provider-specific details). Keep provider-specific information available without forcing unrelated services into a single oversized schema. A user-defined arbitrary collection system is not a prerequisite; introduce it only when a concrete use case establishes its ownership, validation, and access rules. For app-generated feed items, preserve a stable reference to the originating object so feed and object-page views can resolve the same object and its shared comments/reactions under the owning app's authorization rules.

Use a job queue for work to perform (for example, “sync Steam activity”), and activity records for the results (for example, “Steam reported this user started a game”). Start with persistence appropriate to the existing SQLite deployment and a worker alongside the backend; do not add separate queue infrastructure before workload justifies it. Jobs should be retryable, safe to rerun, and respectful of provider rate limits.

## Module-owned authorization and OIDC groups

Modules own the rules for their resources and expose user-scoped operations, rather than requiring every caller to implement permission checks:

```text
module.operationAsUser(authenticatedUser, resourceId, input)
```

The owning module loads the relevant resource, checks its relationships, and returns a domain error or performs the operation. Shared conventions should provide an authenticated user context and reusable primitives only where genuinely common; avoid a universal policy engine unless actual complexity justifies one.

Intended broad rules:

- Admins can manage high-level dashboard configuration.
- Users can create/read/update/delete their own user-authored content.
- Users can read other users' content only when explicitly shared with them; otherwise deny.
- Admin status does not implicitly grant edit access to every user's private content.
- Provider-synced facts remain owned and updated by their integration module, not treated as user-authored content.

Admin status is derived from the current OIDC group memberships using an exact group name configured by `GNAGHOME_ADMIN_GROUP`. It is computed per authenticated request, not persisted as a database flag, so group changes take effect with the refreshed OIDC claims. An unset/blank group name, malformed group claim, or nonmatching membership must produce `isAdmin: false`. The current-user response may expose this derived boolean for UI presentation, but the backend remains authoritative.

OIDC group claims remain available on the authenticated backend user for module-owned sharing and membership checks. Treat claims as untrusted input, parse defensively, and never infer access from a missing or malformed membership. The legacy channel permission tables contain historical allow-all design; those records are retained only for data preservation and are not policy.

### Backend transition status

- Authenticated backend requests now derive `user.isAdmin` from the configured `GNAGHOME_ADMIN_GROUP` and expose normalized OIDC groups to backend modules.
- Shared backend foundations live under `backend/src/platform/auth`, `backend/src/platform/users`, and `backend/src/platform/realtime`; `backend/src/apps/` and `backend/src/integrations/` hold boundary guidance for future domains/connectors, not implemented feature modules.
- The `/users/me` response exposes `isAdmin`; it is presentation data and does not secure other routes by itself.
- This remains foundational plumbing: future dashboard resource modules still need to implement and test their own user-scoped ownership/sharing rules.
- Chat and LiveKit API modules, frontend flows, and provider dependencies have been removed. Legacy database schema declarations remain registered so existing tables are preserved and Drizzle will not infer destructive drops.
- Centrifugo remains active. Its client/server payload contract is a typed, discriminated platform-event union. The counter app is the first producer; dashboard activity and notification event producers have not yet been implemented.

## Centrifugo and frontend reactivity

Keep Centrifugo as the realtime transport. Reframe its event vocabulary from chat-specific events into typed platform events, such as activity-created, notification-created, or integration-sync-status-updated.

Durable database state remains canonical. A Centrifugo event tells a client that its view may need updating; it is not the only copy of a change. On reconnect or suspected missed events, the client can fetch canonical state through the API. Consider a database-backed outbox if reliable publication across database writes and process failures becomes necessary.

Per-user channels (`user:<userId>`) remain the default for user-scoped updates. A shared channel is appropriate when an app needs group-wide updates; the server must explicitly authorize access through channel namespace policy or an authenticated Centrifugo token. The counter uses `public:counter`, matching the configured `public` namespace, whose `allow_subscribe_for_client` setting makes its global-count invalidation visible to any connected Centrifugo client. Counter pages refetch per-user counts and the leaderboard through the authenticated API on each event; keep user-specific counts and leaderboard names off the public event payload.

### Current typed-event implementation

The shared realtime DTO lives in `shared/dto/platform-event.ts`. Define each event as a dedicated payload schema/type and event schema/type with a literal `type`, then add it as a variant in `PlatformEventSchema`; do not widen event names to arbitrary strings or payloads to `unknown`. The current union contains `counter.changed` with a typed `totalCount` payload. The frontend validates untrusted Centrifugo publications in `shared/dto/platform-event-validation.ts` before dispatching them, and the backend broadcast publisher accepts only `PlatformEvent`. Add focused tests for accepted payloads and rejection of unknown event names or malformed payloads whenever adding a new event variant.

## UI direction

Use shared primary navigation: a left-side navigation bar on desktop and a bottom navigation bar on mobile. This shared navigation provides entry points to the apps and shared platform areas, but does not prescribe a common page layout for them. Each app owns its view hierarchy, content, and any app-specific navigation beyond the shared primary navigation.

Use Bits UI as the foundation for reusable, consistently styled controls shared across apps (such as buttons and inputs). Shared wrappers belong in the frontend component layer; app-specific UI should compose them rather than create parallel versions of common controls.

Apps can expose whichever views suit their use cases—for example activity, service status, people, or settings—without requiring every app to adopt a dashboard-wide column or page structure. Shared platform capabilities remain reusable where relevant, while app-specific presentation stays with the app.

## Suggested transition sequence

1. Agree on the first dashboard use case and first integration; use it to validate the activity shape and product navigation.
2. Detach voice/chat from the active product while retaining useful auth, profile, settings, and deployment foundations. Keep shared foundations under `platform/`; add future product areas under `apps/` and provider connectors under `integrations/`.
3. Migrate dashboard modules to user-scoped operations with module-owned owner/share checks; test authorization denial and allowed cases before exposing protected data.
4. Implement one end-to-end integration flow: scheduled/background sync → persisted external activity → API read → Centrifugo update → frontend refresh/update.
5. Add app-generated feed events for concrete app actions, and add comments, reactions, uploads, notifications, audit logging, and richer collections only against concrete dashboard objects/use cases, reusing shared platform services. Feed and object-page views must resolve comments and reactions against the same canonical target; audit records remain separate and admin-only.
6. Add integrations incrementally; defer service splitting or extra infrastructure until operational evidence requires it.

## Open design questions

- Which integration and user-facing dashboard view should be first?
- Which OIDC group identifiers/claims does the deployed provider actually supply, and what exact group value should configure dashboard admins?
- Are dashboard items shared across all users, scoped to OIDC groups, or a mixture?
- What data should each integration retain, and what retention/deletion controls are expected?
- Which app/platform actions and metadata belong in the audit log, what retention and integrity guarantees are needed, and how should sensitive data be excluded while ensuring only admins can read it?
- Is local disk sufficient for media in the expected deployment, or is S3-compatible storage needed from the start?