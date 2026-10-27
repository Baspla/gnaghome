# External-service integrations

Place provider connectors here (for example Steam, Discord, or Minecraft) when they are implemented.

An integration owns provider API calls, credential handling, rate limits, sync cursors, and provider-specific records. It contributes normalized data or requests platform actions through explicit contracts; it must not write directly into an app's tables. Integration accounts remain distinct from OIDC sign-in accounts.

Do not add empty placeholder connectors or a plugin framework before a concrete integration exists.