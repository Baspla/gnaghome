import { treaty } from '@elysiajs/eden';
import type { App } from '../../../backend/src/index';
import { env } from '$env/dynamic/public';

export const api = treaty<App>(env.PUBLIC_GNAGHOME_API_URL || 'http://localhost:3000', {
    onRequest: (path, options) => {
        options.credentials = 'include';
    }
}).api.v1;