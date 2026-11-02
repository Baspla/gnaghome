# Agent instructions

## Project context

- Development runs inside a WSL instance. Be aware of the Linux/Windows boundary when diagnosing paths, networking, file permissions, and access to host services.
- The project is a Bun workspace with a SvelteKit/Svelte 5 frontend, Elysia backend, Drizzle ORM, SQLite, Better Auth/OIDC, shared TypeScript DTOs, and Centrifugo. Confirm dependencies in the package manifests before using a library or adding one.
- Keep the backend a modular monolith unless there is a concrete operational need to split it. Prefer the existing module and dependency-injection patterns.
- Organize backend domains by responsibility: `backend/src/platform/` for shared foundations, `backend/src/apps/` for user-facing product areas, and `backend/src/integrations/` for external providers. Keep each app's data and authorization rules with that app; integrations use explicit platform/app contracts instead of direct writes into another app's tables.
- Prefer reusable platform systems and clear module contracts where they make sense. Avoid solving only the immediate example with one-off, feature-local logic when the behavior is likely to be shared; balance reuse against unnecessary abstraction.
- Preserve the small, self-hostable deployment goal. Avoid introducing infrastructure that is disproportionate to the current scale.

## Frontend UI direction

- Write user-facing frontend text in German, including labels, buttons, headings, helper and error messages, and accessible names. Keep technical identifiers, code symbols, and third-party product names in their original form where appropriate.
- Do not use hash-fragment URLs (`#...`) for frontend navigation; link to the route without a fragment rather than relying on anchor scrolling.
- Use shared primary navigation on the left on desktop and at the bottom on mobile; each app owns the layout and content of its own views beyond that shared navigation.
- Build consistent reusable controls across apps (for example buttons and inputs) on Bits UI primitives. Put shared controls in the frontend's shared component layer (`frontend/src/lib/components/`); app-specific presentation belongs with that app. Prefer the shared control over one-off app-specific variants when the interaction is common.
- Keep Bits UI as the accessible behavioral foundation and apply the project's shared styling through reusable wrappers, rather than letting each app style or compose common controls independently.
- When implementing or wrapping Bits UI components, consult the official documentation at `https://bits-ui.com/docs/llms.txt` (the full LLM-oriented documentation); use a relevant component-specific page when that is more efficient.

### Theme system

- Use `$lib/settings/theme.svelte.ts` and its `themeManager` as the source of truth for named themes and light/dark/system mode. Do not add separate theme state, persistence, or direct document-attribute updates in components.
- When adding or removing a theme, keep the `THEMES` list synchronized with the Skeleton theme imports in `frontend/src/routes/layout.css`. Theme and resolved mode are applied to the document root as `data-theme` and `data-mode`; keep the early bootstrap in `frontend/src/app.html` aligned so saved preferences apply before rendering.
- Use Skeleton's semantic color variants—`primary`, `secondary`, `tertiary`, `success`, `warning`, `error`, and `surface`—instead of hard-coded colors or unrelated palette colors. Use the appropriate shade for the element's role.
- Pair semantic backgrounds with their matching contrast color for foreground content so it remains legible across themes (for example, `bg-primary-500 text-primary-contrast-500` or `bg-error-500 text-error-contrast-500`); do not assume white or black text will contrast correctly.
- For surfaces and text that need to adapt between light and dark modes, use Skeleton's paired-shade utilities (for example, `bg-surface-50-950 text-surface-950-50`) and contrast utilities rather than hard-coding mode-specific colors. The project's `dark:` variant is driven by `[data-mode="dark"]`; use it when palette pairings alone are insufficient.
- When implementing Skeleton styling, themes, or color usage, consult the official Svelte documentation at `https://www.skeleton.dev/llms-svelte.txt`; use a relevant component/design-system page when that is more efficient.
- Keep emoji input and text rendering compatible: use the shared `frontend/src/lib/components/EmojiPicker.svelte` for text-entry pickers, and `frontend/src/lib/components/InlineText.svelte` when displaying text that may contain custom emoji tokens. Store standard emoji as Unicode and custom emoji as `:emoji_name:` tokens; do not substitute rendered markup into persisted text. Unknown/malformed tokens must remain literal text. Render custom emoji inline at no more than `1em` square with `object-fit: contain`, so the image cannot exceed the surrounding text's emoji size. Read custom emoji from the shared catalog; refresh from the API after invalidation/reconnect rather than treating realtime as durable state. See `docs/memories/unified-dashboard-architecture.md` for the implemented custom-emoji contract.

## Architecture and security

- Keep OIDC/Better Auth as sign-in identity. Treat linked Steam, Discord, Minecraft, and other service accounts as distinct from the OIDC login account.
- Authorization belongs on the backend. Prefer module-owned user-scoped operations: each module checks ownership/sharing relationships for resources it owns. Use the computed `user.isAdmin` only for admin-specific operations such as high-level configuration; it does not grant access to all private user content. Never rely on frontend hiding as an access check.
- Legacy chat/channel permission table declarations remain only to preserve existing database tables. They are not active authorization policy and must not be reused.
- Persist durable application state in the database. Centrifugo is for realtime UI updates, not the source of truth; clients must be able to recover by fetching persisted state after reconnects or missed events.
- Define each platform realtime event as its own shared DTO payload schema/type and event schema/type, using a literal event discriminator; compose the variants into a discriminated `PlatformEventSchema` union. Avoid generic `string` event types and `unknown` event payloads.
- Treat Centrifugo publication data as untrusted at the frontend boundary: validate it against the shared event union before dispatching it to handlers. Keep publisher and broadcast contracts typed to the platform event union rather than accepting arbitrary payloads, and test both accepted variants and malformed/unknown events.
- For every new user-visible feature that changes durable state, include the corresponding realtime update or invalidation and client subscription/refetch path, plus reconnect recovery. Keep the database/API authoritative; do not treat realtime as the sole source of truth.
- For app-generated activity, add a typed activity variant and its validation in `backend/src/platform/activity-feed/service.ts`, record it through `ActivityFeedService.recordActivity`, and let that service publish the feed invalidation. Never insert feed rows directly or broadcast private activity data; see `docs/memories/unified-dashboard-architecture.md` for the full pattern.
- If Centrifugo is unreachable during local development, first check whether its Docker container is running and whether Docker itself is started in the WSL/host environment before treating it as an application defect.
- Keep provider-specific integration behavior and data owned by its integration module. Cross-module access should use explicit services/contracts, not direct writes into another module's tables.
- Treat external service credentials, OIDC group claims, and uploaded media as untrusted/sensitive input. Validate inputs, enforce access checks server-side, and do not log secrets or tokens.
- Database changes must use Drizzle schema and migrations. Generate migration files with the workspace `bun run db:generate` script from the repository root; do not invoke Drizzle Kit directly. Do not rewrite migration history or discard existing user data to simplify a refactor. Take care with any destructive schema or data change.

## Development workflow

- Run only non-interactive commands. Do not invoke commands that wait for user input, key presses, or interactive scrolling/paging; use non-interactive flags and bounded output instead.
- Before changing code, inspect nearby modules, their tests, package scripts, and relevant documentation. Follow established patterns unless this task is intentionally changing them.
- Use **red-green-refactor TDD** for behavior changes:
  1. Add or adjust a focused test that describes the desired behavior.
  2. Run it and confirm it fails for the expected reason (red).
  3. Make the smallest implementation that makes it pass (green).
  4. Refactor while keeping the tests green.
- Tests should exercise observable behavior and important failure/authorization paths. Do not weaken or delete a test just to get a green run. If a failing test is unrelated or the environment prevents running it, report that clearly.
- Keep changes scoped. Do not silently fold unrelated cleanup into a task, and do not overwrite unrelated user changes.
- Update shared DTOs/contracts and their consumers together when changing API or realtime event shapes.
- Prefer the backend's existing `Result`/never-throw conventions for service errors and Elysia's typed `status` handling at API boundaries; see `/docs/error-handling.md`.
- For Svelte changes, use Svelte 5 conventions already present in the project and validate the component with the available Svelte tooling.

## Validation commands

Run the relevant checks for the code changed, and report what was and was not run:

```sh
bun --filter @gnaghome/backend test
bun --filter @gnaghome/backend typecheck
bun --filter @gnaghome/frontend check
bun --filter @gnaghome/frontend build
```

For database changes, also review the generated migration and validate it against a disposable/test database where practical. Do not point migration experiments at a user's live database.

## Documentation

- Keep this `AGENTS.md` aligned with current project conventions and agreed product direction. When they change, update the relevant instructions in the same task and remove guidance that is superseded or no longer applicable, including transitional instructions once they are no longer relevant.
- Keep architectural direction and unresolved decisions in `/docs/memories/`. Keep memories current as the project evolves: when the user provides new architectural/product information or updates an earlier decision, update the relevant memory in the same task. Correct or remove superseded guidance instead of leaving conflicting instructions, and distinguish confirmed decisions from proposals and open questions.
- Keep implementation documentation factual: distinguish current behavior from proposals and planned work.
- Do not restore, edit, or otherwise disturb unrelated user-deleted documentation unless specifically asked.
