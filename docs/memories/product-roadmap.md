# Product roadmap and backlog

**Status:** Product direction captured from the user; this is a planning backlog, not a delivery schedule or implementation specification. No priorities or dates have been agreed. An unchecked box means the item is listed here, not that its current implementation state has been audited.

This roadmap describes the intended apps, shared platform systems, and integrations for Gnaghome. Keep the backend a self-hostable modular monolith: apps own their product data and authorization, platform systems provide reusable capabilities, and integrations connect external providers through explicit contracts.

## Apps

- [ ] **CrewNow** — Port/integrate the existing codebase for a BeReal-style social photo app. Image upload and retrieval will need a shared files capability.
- [ ] **Archive** — Port/integrate the existing codebase for a library of user stories.
- [ ] **Stats** — Build visualizations over collected user activity. Prefer consuming persisted activity through a defined contract rather than coupling charts directly to provider integrations.
- [ ] **Games** — Port/integrate the existing codebase to show which games people own and help a group find games to play together. Confirm which providers and ownership data the first version needs.
- [ ] **Calendar** — Add a group calendar.
- [ ] **Reviews** — Let users review things they like or dislike. Decide which kinds of things can be reviewed and whether reviews are ratings, written comments, or both.

## Shared platform systems

- [ ] **Profiles** — Provide shared user-profile data and presentation. Build on the existing local user identity/profile foundation rather than creating a second identity system. Use consistent reusable user and avatar components now so future profile customization can be added without replacing every app's UI.
- [ ] **Files** — Provide a shared way to upload and retrieve files, initially supporting concrete app needs such as CrewNow images. Decide whether this should remain resource-scoped media or grow into shared folders and general-purpose file storage; do not assume a full file drive is needed.
- [ ] **Tasks** — Provide durable asynchronous jobs for work such as fetching a Steam data snapshot, including the appropriate persistence, retry, and failure visibility for a small self-hosted deployment.
- [ ] **User activity** — Persist activity collected from external services in a form that apps such as Stats can query. Define provider-to-platform contracts, user/account attribution, retention, and deletion behavior. Decide whether derived aggregates or visualization-oriented processing belong here or in consuming apps.
- [ ] **Notifications** — Provide a unified, user-scoped way for apps to create and retrieve notifications, with delivery adapters such as web push, Discord, email, and ntfy. Keep durable notification state separate from delivery; define adapter configuration and user preferences as part of the design.
- [ ] **Discussions** — Provide reusable comments on supported app objects. Keep this deliberately narrower than chat: no general rooms, DMs, or attempt to recreate Discord. Resource ownership and access checks must still be enforced by the owning app/contract.
- [ ] **Reactions** — Provide reusable reactions on supported objects. Decide whether the initial scope is standard emoji, uploaded images, or another constrained set, and how reaction access follows the target object's permissions.

## Integrations

### Inbound data connectors

- [ ] **Steam** — Fetch Steam user activity. Confirm whether the Games app also needs owned-game library data in the first integration slice, and how linked Steam accounts map to local users.
- [ ] **Discord** — Fetch Discord user activity, subject to provider capabilities and an explicit mapping between Discord accounts and local users.
- [ ] **Minecraft** — Fetch activity from a Minecraft server and map server identities to local users.

### Outbound publishing connector

- [ ] **Newsletter** — Produce a weekly or monthly newsletter and publish it to a configured webhook. Define which activity/data it summarizes, who configures it, and how scheduled generation and delivery failures are handled.

The split above describes the current use cases, not a settled code architecture. Decide whether inbound account-linked data collection and outbound publishing need distinct integration contracts or lifecycle conventions. Provider-specific behavior belongs to integrations; integrations should use explicit platform/app contracts rather than writing directly to another module's tables.

## Possible future additions

- [ ] **Items, shop, and economy**
- [ ] **Profile customization and cosmetics** — Build on the shared profile and avatar presentation conventions above.
- [ ] **Custom emoji**
- [ ] **Location sharing app**
- [ ] **Music scrobble endpoint and display app**

## Dependency hints (not a priority order)

- User activity plus task execution enables a first end-to-end provider sync and gives Stats and Newsletter data to consume.
- Files supports CrewNow image upload; it does not by itself imply shared folders or a general-purpose drive.
- Discussions and reactions may support Reviews, but Reviews' own rating/review model should be decided separately rather than assuming comments are reviews.
- Profiles and consistent user/avatar components are cross-app foundations. Cosmetic customization can remain future work.
- Calendar can be developed as an app without waiting for the provider activity pipeline.

## Decisions to make as work is sequenced

- Which app and integration form the first useful end-to-end slice? Which existing codebases are being ported, and what changes are needed to integrate them safely?
- What is the group-sharing model for each app, and which module owns each resource's authorization?
- What is the shared user-activity contract, including identity mapping, source attribution, retention, deletion, and any derived data?
- How should integrations be grouped: inbound per-user account mapping and sync versus outbound publishing, or one common contract with clear capabilities?
- What is the minimum files scope and storage target for the initial upload use cases?
- What guarantees and operational visibility should Tasks provide for retries, duplicate work, and failed jobs?
- How are notification delivery channels configured, and how do users control preferences and failures?
- How should Discussions and Reactions identify target objects and defer to each app's access rules?
- What does a Review attach to, and what review/rating format is useful?
- What activity and sources should Newsletter summarize, and how are its cadence and webhook configured?
- What timezone, sharing, and editing rules does the group Calendar need?