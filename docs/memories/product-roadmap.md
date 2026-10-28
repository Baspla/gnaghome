# Product roadmap and backlog

**Status:** Product direction captured from the user; this is a planning backlog, not a delivery schedule or implementation specification. No priorities or dates have been agreed. An unchecked box means the item is listed here, not that its current implementation state has been audited.

This roadmap describes the intended apps, shared platform systems, and integrations for Gnaghome. Keep the backend a self-hostable modular monolith: apps own their product data and authorization, platform systems provide reusable capabilities, and integrations connect external providers through explicit contracts.

## Apps

- [ ] **CrewNow** — Port/integrate the existing codebase for a BeReal-style social photo app. Image upload and retrieval will need a shared files capability.
- [ ] **Archive** — Port/integrate the existing codebase for a library of user stories.
- [ ] **Stats** — Build visualizations over activity collected from external services. Prefer consuming persisted activity through a defined contract rather than coupling charts directly to provider integrations.
- [ ] **Games** — Port/integrate the existing codebase to show which games people own and help a group find games to play together. Confirm which providers and ownership data the first version needs.
- [ ] **Calendar** — Add a group calendar.
- [ ] **Reviews** — Let users review things they like or dislike. Decide which kinds of things can be reviewed and whether reviews are ratings, written comments, or both.

## Shared platform systems

- [x] **Profiles** — Initial profile presentation is implemented on the existing local user identity/profile foundation: authenticated `/profile/<id>` pages show the user's profile picture, name, and account creation date, with reusable `Username` and `ProfilePicture` components. Further profile customization remains future work.
- [ ] **Files** — Provide a shared way to upload and retrieve files, initially supporting concrete app needs such as CrewNow images. Decide whether this should remain resource-scoped media or grow into shared folders and general-purpose file storage; do not assume a full file drive is needed.
- [ ] **Tasks** — Provide durable asynchronous jobs for work such as fetching a Steam data snapshot, including the appropriate persistence, retry, and failure visibility for a small self-hosted deployment.
- [ ] **Activity feed** — Provide a central feed of user actions from Gnaghome apps, such as someone posting a CrewNow image. Feed items should link to their originating app objects and be shown only where the viewer is authorized to access them.
- [ ] **Audit log** — Durably record actions across apps and platform systems, including creations, updates, and deletions, for administrative oversight. Audit records are separate from social activity-feed items and external user activity, and only admins may view them; enforce this on the backend.
- [ ] **External user activity** — Persist activity collected from external services in a form that apps such as Stats can query. Define provider-to-platform contracts, user/account attribution, retention, and deletion behavior. Decide whether derived aggregates or visualization-oriented processing belong here or in consuming apps; this provider activity is distinct from app-generated feed items.
- [ ] **Notifications** — Provide a unified, user-scoped way for apps to create and retrieve notifications, with delivery adapters such as web push, Discord, email, and ntfy. Keep durable notification state separate from delivery; define adapter configuration and user preferences as part of the design.
- [ ] **Discussions** — Provide reusable comments on supported app objects. A comment shown on an activity-feed item and on its originating app page must be the same comment on the same canonical target, not separate per-view discussions. Keep this deliberately narrower than chat: no general rooms, DMs, or attempt to recreate Discord. Resource ownership and access checks must still be enforced by the owning app/contract.
- [ ] **Reactions** — Provide reusable reactions on supported objects. A reaction shown on an activity-feed item and on its originating app page must be the same reaction on the same canonical target, not separate per-view counts or records. Decide whether the initial scope is standard emoji, uploaded images, or another constrained set, and how reaction access follows the target object's permissions.

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

- External user activity plus task execution enables a first end-to-end provider sync and gives Stats and Newsletter data to consume; the Activity feed records actions within Gnaghome apps and is a separate use case.
- The Audit log is an administrative record of changes, not a social feed or analytics source; its admin-only access must be enforced by backend authorization.
- The Activity feed, Discussions, and Reactions work together: feed entries link to app-owned objects, while comments and reactions stay canonical to those targets and obey the owning app's access rules.
- Files supports CrewNow image upload; it does not by itself imply shared folders or a general-purpose drive.
- Discussions and reactions may support Reviews, but Reviews' own rating/review model should be decided separately rather than assuming comments are reviews.
- Profiles and consistent user/avatar components are cross-app foundations. Cosmetic customization can remain future work.
- Calendar can be developed as an app without waiting for the provider activity pipeline.

## Decisions to make as work is sequenced

- Which app and integration form the first useful end-to-end slice? Which existing codebases are being ported, and what changes are needed to integrate them safely?
- What is the group-sharing model for each app, and which module owns each resource's authorization?
- What are the contracts for app-generated feed items and externally collected user activity, including attribution, retention, deletion, and any derived data?
- Which actions and fields must the Audit log capture, what retention and integrity guarantees are needed, and how should sensitive data be excluded while keeping audit-log reads admin-only?
- How should integrations be grouped: inbound per-user account mapping and sync versus outbound publishing, or one common contract with clear capabilities?
- What is the minimum files scope and storage target for the initial upload use cases?
- What guarantees and operational visibility should Tasks provide for retries, duplicate work, and failed jobs?
- How are notification delivery channels configured, and how do users control preferences and failures?
- How should feed entries identify their originating objects, and how should Discussions and Reactions share the same canonical target across feed and object-page views while deferring to each app's access rules?
- What does a Review attach to, and what review/rating format is useful?
- What activity and sources should Newsletter summarize, and how are its cadence and webhook configured?
- What timezone, sharing, and editing rules does the group Calendar need?