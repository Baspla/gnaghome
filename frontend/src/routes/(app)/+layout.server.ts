import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		const redirectTo = url.pathname + url.search;
		throw redirect(302, `/login?redirect=${encodeURIComponent(redirectTo)}`);
	}

	return {
		session: locals.session,
		user: locals.user,
	};
};
