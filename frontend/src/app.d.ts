// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	const __APP_VERSION__: string;
	namespace App {
		// interface Error {}
		interface Locals {
			session: {
				id: string;
				userId: string;
				expiresAt: string | Date;
				[key: string]: unknown;
			} | null;
			user: {
				id: string;
				email: string;
				name: string;
				image?: string | null;
				isAdmin: boolean;
				[key: string]: unknown;
			} | null;
		}
		interface PageData {
			session: App.Locals['session'];
			user: App.Locals['user'];
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
