import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

type UserProfile = {
    id: string;
    name: string;
    image: string | null;
    createdAt: string;
};

export const load: PageServerLoad = async ({ params, request, fetch }) => {
    const backendBaseUrl = env.GNAGHOME_API_URL_INTERNAL ?? 'http://localhost:3000/api';
    let response: Response;

    try {
        response = await fetch(`${backendBaseUrl}/v1/users/${encodeURIComponent(params.id)}`, {
            headers: {
                cookie: request.headers.get('cookie') ?? '',
            },
        });
    } catch {
        throw error(502, 'Could not load this profile. Please try again later.');
    }

    if (response.status === 404) {
        throw error(404, 'User not found');
    }
    if (response.status === 401) {
        throw error(401, 'Please sign in to view this profile');
    }
    if (!response.ok) {
        throw error(502, 'Could not load this profile. Please try again later.');
    }

    const profile = await response.json() as UserProfile;
    return {
        profile: {
            id: profile.id,
            name: profile.name,
            image: profile.image,
            createdAt: profile.createdAt,
        },
    };
};