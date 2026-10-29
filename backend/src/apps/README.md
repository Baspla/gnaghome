# Product apps

Place user-facing dashboard domains here (for example Photos, Literature, or Calendar) as they are implemented.

Each app owns its domain data, API operations, and authorization rules. Use user-scoped operations and keep ownership/sharing checks with the app that understands the resource. Reuse platform capabilities through explicit service contracts; do not make apps write directly into one another's tables.

Do not add empty placeholder app modules or a plugin framework before a concrete product area exists.