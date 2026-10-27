// Keep test imports independent from a developer's local backend/.env file.
process.env.GNAGHOME_BETTER_AUTH_SECRET = 'test-only-auth-secret';
process.env.GNAGHOME_BETTER_AUTH_URL = 'http://localhost:5173';
process.env.GNAGHOME_HOSTNAME = 'http://localhost:5173';
process.env.GNAGHOME_DATABASE_URL = ':memory:';
process.env.GNAGHOME_OAUTH_DISCOVERY_URL = 'https://issuer.example/.well-known/openid-configuration';
process.env.GNAGHOME_OAUTH_CLIENT_ID = 'test-client';
process.env.GNAGHOME_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.GNAGHOME_LOG_LEVEL = 'error';
process.env.GNAGHOME_BETTER_AUTH_LOG_LEVEL = 'error';