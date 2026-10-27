import { Modules } from '$shared/constants';
import Elysia from 'elysia';
import { isAdminFromGroups, parseGroupClaims } from './authorization';

export type SessionPayload = {
    user: {
        id: string;
        groups?: string | null;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        email: string;
        emailVerified: boolean;
        image?: string | null;
    };
    session: { id: string };
};
export type SessionResolver = (headers: Headers) => Promise<SessionPayload | null>;

export type AuthenticatedUser = Omit<SessionPayload['user'], 'groups'> & {
    groups: string[];
    isAdmin: boolean;
};

function toAuthenticatedUser(user: SessionPayload['user'], adminGroupName: string | undefined): AuthenticatedUser {
    const groups = parseGroupClaims(user.groups);
    return {
        ...user,
        groups,
        isAdmin: isAdminFromGroups(groups, adminGroupName),
    };
}

export function createAuthMiddleware(
    getSession: SessionResolver,
    handler: (request: Request) => Response | Promise<Response>,
    adminGroupName?: string,
) {
    return new Elysia({ name: Modules.AUTH })
        .mount('/api/betterauth', handler)
        .macro({
            auth: {
                async resolve({ status, request: { headers } }) {
                    const session = await getSession(headers);
                    if (!session) return status(401);

                    return {
                        user: toAuthenticatedUser(session.user, adminGroupName),
                        session: session.session,
                    };
                },
            },
        });
}