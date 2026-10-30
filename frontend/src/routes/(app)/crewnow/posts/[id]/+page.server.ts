import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ params, request, fetch }) => {
    const backendBaseUrl = env.GNAGHOME_API_URL_INTERNAL ?? 'http://localhost:3000/api';
    let response: Response;
    try {
        response = await fetch(`${backendBaseUrl}/v1/crewnow/posts/${encodeURIComponent(params.id)}`, {
            headers: { cookie: request.headers.get('cookie') ?? '' },
        });
    } catch {
        throw error(502, 'CrewNow konnte nicht geladen werden. Bitte versuche es später erneut.');
    }
    if (response.status === 404) throw error(404, 'CrewNow nicht gefunden.');
    if (response.status === 401) throw error(401, 'Bitte melde dich an, um dieses CrewNow anzusehen.');
    if (!response.ok) throw error(502, 'CrewNow konnte nicht geladen werden. Bitte versuche es später erneut.');
    return { post: await response.json() };
};