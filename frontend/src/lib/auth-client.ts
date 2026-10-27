import { createAuthClient } from "better-auth/svelte";
import { env } from '$env/dynamic/public';

export const authClient = createAuthClient({
    baseURL: `${env.PUBLIC_GNAGHOME_BETTER_AUTH_URL||"http://localhost:3000"}/api/betterauth/auth`,
});
