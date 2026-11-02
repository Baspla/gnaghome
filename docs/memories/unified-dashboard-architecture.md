# Unified dashboard: architecture memory

**Status:** Direction agreed in conversation; this is a high-level proposal, not an implementation specification. Update it when the product direction changes.

## Product direction

Gnaghome is moving away from being a chat and voice application. The intended product is a unified dashboard that brings together different services (initial examples: Steam, Discord, and Minecraft) that are currently separate. The goal is a small, self-hostable application for a known group, not a large public multi-tenant platform.

The intended audience is a close friend group. Prefer a simple permission model over elaborate sharing hierarchies: for each action, decide whether it is available to everyone in the group, only the author/owner, or only an admin. “Everyone” means authenticated Gnaghome users in this group, not the public. Apps still own their resources and enforce the applicable rule on the backend.

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
- Notifications, comments and reactions on supported dashboard items, and shared Files capability for uploads. When an object appears in the feed and on its app page, both views use the same canonical comments and reactions rather than separate copies.
- A persistent background-task mechanism for provider polling/sync, retries, and related asynchronous work. Image upload is currently synchronous; adding image processing remains future work.

### Shared Files capability

Files is a general-purpose platform capability, not CrewNow-owned media logic. Start with image uploads/retrieval; add other media/file categories only for concrete use cases. Store bytes on local disk beneath the backend's existing Docker-persisted data volume, and keep file metadata in SQLite. Do not expose the storage directory as a public static directory: provide stable `/api/v1/files/<opaque-id>` read URLs through the backend, with an active Gnaghome session required (the deployment's oauth2proxy is an additional outer gate, not a substitute). This path also matches production routing, where `/api` requests go to the backend and other paths go to the frontend.

Each file records its uploader and a `private` flag, plus a lifecycle status and optional pending-upload expiry. New uploads are pending and private to the uploader for 24 hours; the uploader may preview them during that period. Finalization is an internal, idempotent service operation for the owning app to call after persisting a reference; it marks the file ready, clears expiry, and sets its ready-file visibility. Ready non-private files are readable by any signed-in Gnaghome user; ready private files are readable only by their uploader. Pending files are unavailable to other users, and deleting files are hidden. Knowing the opaque ID alone grants no access. There is no generic HTTP delete/finalize endpoint: the app owning a file reference must authorize and update/delete that resource before calling the Files service internally to finalize or remove an unreferenced file. Startup and hourly cleanup removes expired pending uploads and retries records marked deleting after a storage failure. App-triggered deletion also marks the file deleting before removing bytes so a failed storage operation can be retried safely. This is a small Files-owned default rule, not a general resource-sharing system; apps may keep richer resource authorization in their own domain when needed. Storage mechanics sit behind a service interface so a different storage backend can be considered later without coupling apps to local paths. Backups of the Docker data volume must include both SQLite and the files directory for a complete restore.

The initial image scope should validate supported image types from file content, cap upload sizes, avoid user-controlled storage paths, and return safe inline image responses. Decisions about image transcoding/EXIF stripping and future object-storage support remain open until a concrete need justifies their added dependency/complexity.

Current implementation: `backend/src/platform/files` provides authenticated image upload and read, internal finalization/deletion, and startup/hourly expired-pending cleanup. It stores metadata in SQLite and bytes under `GNAGHOME_FILES_DIRECTORY` (default `backend/data/files`, mounted under the existing Docker data volume in deployment). Reads use `/api/v1/files/<id>`, matching the production `/api` backend route. The accepted formats are PNG, JPEG, GIF, WebP, AVIF, and APNG, with a 10 MiB limit; content type is detected with the `file-type` library. The initial version does not transcode or strip EXIF metadata.

## Backend organization

Keep the backend as one modular monolith, but make the roles of its modules visible in the source tree:

```text
backend/src/
  platform/       # Shared foundations used across product areas
    auth/
    users/
    realtime/     # Centrifugo transport and platform event delivery
    files/        # Shared image upload/storage capability
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

The active platform modules include `platform/auth`, `platform/users`, `platform/realtime`, `platform/files`, and `platform/activity-feed`. Implemented product apps include `apps/crewnow`; it owns post behavior and authorization, while Files owns reusable upload/storage mechanics and its general private-file rule. CrewNow posts have immutable front/back images, editable captions and photo tags, an infinite cursor-paginated timeline, and individual post pages. Capture starts parallel pending/private uploads after both images are taken; retake/cancel discards unreferenced pending files, and publishing finalizes them. A post's one `crewnow.image_posted` activity resolves live tags from the owning post when read, so edits update the activity description; feed invalidation prompts connected clients to refetch. The `integrations/` directory contains boundary guidance for future connectors. Integrations contribute through explicit contracts and must not write directly into app-owned tables. These are source-code boundaries inside one deployment, not separate services or a plugin framework.

## Integration and data boundaries

Each provider integration owns its API calls, credential handling, rate limits, cursors, and provider-specific records. Integrations contribute normalized external activity or request notifications through explicit platform services/contracts; they do not write directly into another module's tables. App-generated feed events are a separate source of activity: apps publish them through a platform contract, and feed entries reference app-owned objects rather than replacing or duplicating those objects. Audit records are a separate administrative trail of changes; app and platform operations should record relevant create/update/delete actions through a shared contract, and audit-log reads must be restricted to admins by backend authorization.

Model externally collected activity with a small common envelope (for example: actor, source/provider, event type, occurred-at time, and a reference or validated payload for provider-specific details). Keep provider-specific information available without forcing unrelated services into a single oversized schema. A user-defined arbitrary collection system is not a prerequisite; introduce it only when a concrete use case establishes its ownership, validation, and access rules. For app-generated feed items, preserve a stable reference to the originating object so feed and object-page views can resolve the same object and its shared comments/reactions under the owning app's authorization rules.

Use a job queue for work to perform (for example, “sync Steam activity”), and activity records for the results (for example, “Steam reported this user started a game”). Start with persistence appropriate to the existing SQLite deployment and a worker alongside the backend; do not add separate queue infrastructure before workload justifies it. Jobs should be retryable, safe to rerun, and respectful of provider rate limits.

### Current task system

`backend/src/platform/tasks` implements a small internal-only task service backed by SQLite. Other backend modules can register typed task handlers, enqueue JSON-object payloads, and create or pause recurring schedules using five-field UTC cron syntax. The backend process runs one task at a time, retries failures up to a bounded attempt count, and recovers interrupted work after restart. Delivery is at-least-once: handlers should be safe to repeat if a process stops after performing side effects but before marking a task complete. Recurring schedules enqueue at most one overdue occurrence after downtime and then advance to the next future cron time. `TasksService.getTaskState()` exposes task and schedule status metadata for future admin use, omitting payloads. Startup recovery assumes one backend task runner per database. There are no task HTTP endpoints or UI.

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
- Shared backend foundations live under `backend/src/platform/auth`, `backend/src/platform/users`, `backend/src/platform/realtime`, and `backend/src/platform/files`; `backend/src/apps/` and `backend/src/integrations/` hold boundary guidance for future domains/connectors, not implemented feature modules.
- The `/users/me` response exposes `isAdmin`; it is presentation data and does not secure other routes by itself.
- This remains foundational plumbing: future dashboard resource modules still need to implement and test their own user-scoped ownership/sharing rules.
- Chat and LiveKit API modules, frontend flows, and provider dependencies have been removed. Legacy database schema declarations remain registered so existing tables are preserved and Drizzle will not infer destructive drops.
- Centrifugo remains active. Its client/server payload contract is a typed, discriminated platform-event union. The counter app is the first producer; dashboard activity and notification event producers have not yet been implemented.

## Centrifugo and frontend reactivity

Keep Centrifugo as the realtime transport. Reframe its event vocabulary from chat-specific events into typed platform events, such as activity-created, notification-created, or integration-sync-status-updated.

Durable database state remains canonical. A Centrifugo event tells a client that its view may need updating; it is not the only copy of a change. On reconnect or suspected missed events, the client can fetch canonical state through the API. Consider a database-backed outbox if reliable publication across database writes and process failures becomes necessary.

Per-user channels (`user:<userId>`) remain the default for user-scoped updates. A shared channel is appropriate when an app needs group-wide updates; the server must explicitly authorize access through channel namespace policy or an authenticated Centrifugo token. The counter uses `public:counter`, matching the configured `public` namespace, whose `allow_subscribe_for_client` setting makes its global-count invalidation visible to any connected Centrifugo client. Counter pages refetch per-user counts and the leaderboard through the authenticated API on each event; keep user-specific counts and leaderboard names off the public event payload.

### Current typed-event implementation

The shared realtime DTO lives in `shared/dto/platform-event.ts`. Define each event as a dedicated payload schema/type and event schema/type with a literal `type`, then add it as a variant in `PlatformEventSchema`; do not widen event names to arbitrary strings or payloads to `unknown`. The current union contains content-free `activity-feed.changed` and `discussion.changed` invalidations; clients refetch persisted records through permission-checked API reads. The frontend validates untrusted Centrifugo publications in `shared/dto/platform-event-validation.ts` before dispatching them, and the backend broadcast publisher accepts only `PlatformEvent`. Add focused tests for accepted payloads and rejection of unknown event names or malformed payloads whenever adding a new event variant.

### Adding and recording app-generated activity

Activity types and their payload contracts live in `backend/src/platform/activity-feed/service.ts`: extend `ACTIVITY_TYPES`, `ActivityDataByType`, `RecordActivityInput`, and the runtime `isValidActivityData`/reference validation together. Require a namespaced target type and matching target ID where the event refers to an app object; keep actor and subject semantics explicit for user actions versus system-generated items. Add tests for valid payloads, malformed payloads, and required actor/subject/target rules. Record events through the injected `ActivityFeedService.recordActivity` (wired with the realtime publisher in `backend/src/services.ts`); do not write `activity_feed_item` rows directly. Successful recording stores the canonical item and emits a content-free `activity-feed.changed` invalidation on `public:activity-feed`; clients refetch through the authenticated, permission-checked API. A publication failure must not undo the durable action. Update the feed API's target visibility/resolution logic and its tests before exposing new target types, and update the dashboard renderer for newly supported activity types. Keep activity feeds separate from audit records and external-provider activity.

When adding a realtime event, define its literal discriminator and payload schema/type in `shared/dto/platform-event.ts`, add it to `PlatformEventSchema`, validate it in `shared/dto/platform-event-validation.ts`, add focused DTO tests for valid and malformed/unknown values, and add/authorize any required channel in `shared/constants.ts` and the Centrifugo token. Subscribe via the frontend gateway, handle the event in the relevant view by refetching canonical state, and refetch on reconnect. Never put private activity contents or target permissions into a shared-channel invalidation payload.

### Current Discussions implementation

`backend/src/platform/discussions/` stores one canonical `discussion` per namespaced target and ordered `discussion_message` rows. Each consuming app supplies a `canViewDiscussionTarget` authorization contract; the platform module resolves the target and applies that contract before message reads and writes. Any authenticated user may comment, but only the message author may edit or delete. Edits set `edited_at`; message create/edit/delete publishes content-free `discussion.changed` and `activity-feed.changed` invalidations. CrewNow posts and feed rows reference the same discussion ID, feed comment counts are computed from persisted messages, and the shared `Discussion.svelte` panel refetches after invalidations or reconnect. The initial migration backfills existing posts; a later idempotent repair migration covers pre-existing installations that applied the feature schema before the backfill was added. This is implemented for CrewNow; future apps must add their target authorization to the app-level callback before attaching Discussions.

### Current emoji implementation

`frontend/src/lib/components/EmojiPicker.svelte` is the shared picker used by the discussion composer and both CrewNow caption modes (create/edit via `PostEditor.svelte`). Standard emoji are inserted as Unicode. Custom emoji are inserted as `:emoji_name:` tokens and stay tokens in persisted comments/captions; `frontend/src/lib/components/InlineText.svelte` renders only catalog-known tokens as images, preserving unknown/malformed tokens as literal text. Inline custom images are constrained to `1em` square with `object-fit: contain` and baseline alignment, so they do not render larger than the surrounding text's normal emoji size.

The global custom emoji catalog is stored in SQLite (`custom_emoji`) and uses the Files platform for image bytes. Signed-in users can read the catalog; create/delete routes require the backend-computed `user.isAdmin`. Names are unique while present, use the lowercase token-safe name format, and may be reused after deletion; existing `:name:` references then resolve to the newly uploaded emoji. Catalog entries include the uploader's public user ID/name and creation date. Supported animated image formats are served as uploaded through Files. Catalog create/delete emits the content-free `custom-emojis.changed` platform invalidation; the frontend subscribes to its authorized global channel and refetches the API catalog initially, after invalidation, and on reconnect. The database/API remains authoritative.

Future text-entry surfaces that support custom emoji should compose the shared picker and preserve their input's cursor, selection, and length-limit behavior. Future text display surfaces that support custom emoji should use `InlineText` rather than injecting HTML or rendering image markup into stored text. Keep picker image thumbnails and inline text images within their respective normal-emoji size bounds.

### Hash-fragment navigation decision

Do not use hash-fragment URLs (`#...`) for frontend navigation. The CrewNow activity-feed comment-count link previously appended `#comments`, but opening that URL did not reliably bring the discussion into view in the app's scroll layout; the post could open with its image visible while the comments remained below the viewport. The agreed behavior is to remove the fragment and open the post route normally. Do not add custom fragment-scrolling behavior unless the product direction changes.

## UI direction

Use shared primary navigation: a left-side navigation bar on desktop and a bottom navigation bar on mobile. This shared navigation provides entry points to the apps and shared platform areas, but does not prescribe a common page layout for them. Each app owns its view hierarchy, content, and any app-specific navigation beyond the shared primary navigation.

Use Bits UI as the foundation for reusable, consistently styled controls shared across apps (such as buttons and inputs). Shared wrappers belong in the frontend component layer; app-specific UI should compose them rather than create parallel versions of common controls.

For horizontally scrolling tab/navigation lists on mobile, leave a small bottom gap between the items and the scrollbar (for example, mobile-only `pb-2` reset at the desktop breakpoint). Firefox renders a visible horizontal scrollbar that can otherwise sit flush against the tab controls; preserve this spacing when adding similar scrollers.

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
- For each app action, which operations are available to everyone in the friend group, only the author/owner, or only admins? Keep any exceptions explicit and enforced by the owning app.
- What data should each integration retain, and what retention/deletion controls are expected?
- Which app/platform actions and metadata belong in the audit log, what retention and integrity guarantees are needed, and how should sensitive data be excluded while ensuring only admins can read it?
- If local media storage later becomes insufficient, what operational need justifies adding an S3-compatible storage adapter?