# Gnaghome

Gnaghome is transitioning into a unified dashboard for services used by a small group. The goal is a self-hostable application, not a large public multi-tenant platform.

## Techstack
- Backend: Bun, Elysia, Eden Treaty, Drizzle, SQLite, Better Auth
- Frontend: Svelte 5, SvelteKit, Eden Treaty, Tailwind CSS, Lucide, Bits UI, Skeleton UI, Better Auth
- Realtime UI updates: Centrifugo

Alle genaueren genutzten Libraries sind in den jeweiligen frontend/package.json und backend/package.json Dateien zu finden.

## Authentication and authorization

An OIDC provider is required for sign-in. The backend derives `isAdmin` from the OIDC group configured by `GNAGHOME_ADMIN_GROUP`. Resource ownership and sharing checks belong to the module that owns each resource.

## Product roadmap

The planned apps, shared platform systems, integrations, and future ideas are tracked in the [product roadmap](docs/memories/product-roadmap.md).

## Datenschutz
This application is intended for a small, trusted group. Review the data each connected service contributes and secure the deployment and credentials appropriately.

## Deployment
Die App wird bei jedem Commit automatisch als Docker Image gebaut und ist im GitHub Container Registry verfügbar.
Nach erfolgreichem Build der Images ruft der Workflow bei Änderungen auf `main` den Produktions-Webhook per HTTP POST auf. Hinterlege dessen URL als GitHub-Repository-Secret `PRODUCTION_DEPLOY_WEBHOOK_URL`; Pull Requests lösen keinen Produktions-Deploy aus.
Die Compose Datei für das Deployment ist in docker-compose.yml zu finden.
Diese Datei sollte up-to-date mit meinem aktuellen Deployment sein, spezifische Anpassungen hinsichtlich Netzwerk, Ports, Volumes und Secrets müssen eventuell noch gemacht werden.

Deployment environment variables use the `GNAGHOME_` prefix (and `PUBLIC_GNAGHOME_` for frontend variables). Update existing deployment environment files when upgrading; the previous prefix is no longer read. The Compose configuration retains the existing Docker data volume while changing the project's name.

## LLM-Nutzung
Beim erstellen des Codes wurde ein LLM (Deepseek V4) genutzt, das mich bei der Eintwicklung unterstützt hat.