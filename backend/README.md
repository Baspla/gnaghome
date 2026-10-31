# Gnaghome Backend

The backend uses Bun, Elysia, Eden Treaty, Drizzle, and SQLite. Better Auth provides OIDC-backed sessions.

Centrifugo is retained for realtime UI updates. It delivers typed platform-event envelopes to user-scoped channels; durable application state remains in SQLite and clients should refetch state after reconnects or missed events.

External-service integrations should own their provider-specific behavior and call shared platform services through explicit contracts. Resource authorization belongs in module-owned user-scoped operations. The authenticated user includes OIDC group memberships and a computed `isAdmin` derived from `GNAGHOME_ADMIN_GROUP`.

Backend code is organized by responsibility: `src/platform/` contains shared foundations (`auth`, `users`, `realtime`, and `files` today), `src/apps/` is the home for user-facing product domains, and `src/integrations/` is the home for provider connectors. See those directories' README files for ownership and dependency boundaries.

The Files platform accepts authenticated image uploads at `POST /api/v1/files` and serves them inline at `GET /api/v1/files/:id`. Uploads start pending, private to the uploader, and expire after 24 hours. An owning app finalizes an upload through `FilesService.finalizeUpload` after it has persisted a resource reference; finalization is idempotent, clears the expiry, and selects the ready file's visibility. Pending files can be previewed by their uploader but cannot be read by other users. Startup and hourly cleanup remove expired pending files, retrying records marked for deletion after storage failures. There is intentionally no generic HTTP delete/finalize endpoint: apps use internal service methods after their own authorization and reference handling. The internal delete operation hides a file before removing its bytes; the scheduled cleanup retries if storage deletion fails. Bytes are stored under `GNAGHOME_FILES_DIRECTORY` (default `data/files`) on local disk; mount and back up that directory with the SQLite database. Images are verified from their content, limited to PNG, JPEG, GIF, WebP, AVIF, and APNG, and capped at 10 MiB. Ready non-private files are readable by any signed-in user; ready private files are uploader-only. The deployment proxy routes `/api` to the backend, keeping these file URLs behind the existing frontend/auth proxy rather than exposing the storage directory.

The internal Tasks platform is available from `src/platform/tasks`. Modules augment `TaskPayloadMap` with named JSON payload types, register a matching worker on the shared `TasksService`, and enqueue tasks or set up recurring five-field UTC cron schedules. The serial runner starts with the backend, allows three total attempts by default (configurable to at most 20), and records queued/running/succeeded/failed state in SQLite. Task delivery is at-least-once, so handlers should be idempotent. Run one backend task runner against a database; task claiming is safe between competing runners, but startup recovery assumes a single runner. `TasksService.getTaskState()` returns task/schedule state metadata without payloads for future admin use. No task HTTP endpoints or UI exist yet.

```ts
declare module '../../platform/tasks/service' {
    interface TaskPayloadMap {
        'example.refresh': { resourceId: string };
    }
}

tasks.registerWorker('example.refresh', async ({ resourceId }) => {
    // Refresh the resource; make side effects safe to repeat.
});

await tasks.enqueueTask('example.refresh', { resourceId: 'resource-123' });
await tasks.scheduleTask('example.daily-refresh', 'example.refresh', { resourceId: 'resource-123' }, '0 3 * * *');
```

Legacy chat and permission table declarations remain registered with Drizzle to prevent accidental destructive migrations. They are not active backend modules; remove the legacy schema only as part of a deliberate data migration/retention decision.
