/**
 * Parses the serialized OIDC `groups` user field. Invalid input grants no memberships.
 */
export function parseGroupClaims(value: unknown): string[] {
    let parsed: unknown = value;

    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];

    const groups = new Set<string>();
    for (const item of parsed) {
        if (typeof item !== 'string') continue;
        const group = item.trim();
        if (group) groups.add(group);
    }
    return [...groups];
}

/** Admin is derived from current OIDC memberships; a missing config grants no admin. */
export function isAdminFromGroups(groupClaims: unknown, adminGroupName: string | undefined): boolean {
    const configuredGroup = adminGroupName?.trim();
    if (!configuredGroup) return false;
    return parseGroupClaims(groupClaims).includes(configuredGroup);
}