type AdminStatusFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Loads the authoritative admin flag for the signed-in user, defaulting to false on failure. */
export async function fetchCurrentUserAdminStatus(
    fetcher: AdminStatusFetcher,
    apiBaseUrl: string,
    cookie: string,
    expectedUserId: string,
): Promise<boolean> {
    try {
        const baseUrl = apiBaseUrl.replace(/\/$/, '');
        const response = await fetcher(`${baseUrl}/v1/users/me`, {
            headers: { cookie },
        });
        if (!response.ok) return false;

        const profile: unknown = await response.json();
        if (typeof profile !== 'object' || profile === null) return false;

        const currentUser = profile as { id?: unknown; isAdmin?: unknown };
        return currentUser.id === expectedUserId && currentUser.isAdmin === true;
    } catch {
        return false;
    }
}