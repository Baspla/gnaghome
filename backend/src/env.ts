const readEnv = (key: string): string | undefined => {
    const value = process.env[key]?.trim();
    return value && value.length > 0 ? value : undefined;
};

const requireEnv = (key: string): string => {
    const value = readEnv(key);
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
};

const oauthDiscoveryUrl = readEnv('GNAGHOME_OAUTH_DISCOVERY_URL');
const oauthClientId = readEnv('GNAGHOME_OAUTH_CLIENT_ID');
const oauthClientSecret = readEnv('GNAGHOME_OAUTH_CLIENT_SECRET');

if (!oauthDiscoveryUrl || !oauthClientId || !oauthClientSecret) {
    throw new Error(
        'Incomplete OAuth configuration. Set GNAGHOME_OAUTH_DISCOVERY_URL, GNAGHOME_OAUTH_CLIENT_ID and GNAGHOME_OAUTH_CLIENT_SECRET together.'
    );
}

export const env = {
    DATABASE_URL: requireEnv('GNAGHOME_DATABASE_URL'),
    BETTER_AUTH_URL: readEnv('GNAGHOME_BETTER_AUTH_URL') ?? 'http://localhost:5173',
    BETTER_AUTH_SECRET: readEnv('GNAGHOME_BETTER_AUTH_SECRET') ?? '',
    HOSTNAME: readEnv('GNAGHOME_HOSTNAME') ?? 'http://localhost:5173',
    OAUTH_PROVIDER_ID: readEnv('GNAGHOME_OAUTH_PROVIDER_ID') ?? 'generic-oauth',
    OAUTH_DISCOVERY_URL: oauthDiscoveryUrl,
    OAUTH_CLIENT_ID: oauthClientId,
    OAUTH_CLIENT_SECRET: oauthClientSecret,
    ADMIN_GROUP_NAME: readEnv('GNAGHOME_ADMIN_GROUP'),
    API_URL_INTERNAL: readEnv('GNAGHOME_API_URL_INTERNAL') ?? 'http://localhost:3000/api',
    CENTRIFUGO_URL: readEnv('GNAGHOME_CENTRIFUGO_URL') ?? 'http://localhost:8000',
    CENTRIFUGO_SECRET: readEnv('GNAGHOME_CENTRIFUGO_JWT_SECRET') ?? 'default_secret',
    CENTRIFUGO_API_KEY: readEnv('GNAGHOME_CENTRIFUGO_API_KEY') ?? 'default_http_api_key',
    LOG_LEVEL: readEnv('GNAGHOME_LOG_LEVEL') ?? 'info',
    BETTER_AUTH_LOG_LEVEL: readEnv('GNAGHOME_BETTER_AUTH_LOG_LEVEL') ?? 'info',
};
