import { Elysia, t } from 'elysia'
import { Modules } from '@gnaghome/shared/constants'
import type { AuthenticatedUser, createAuthMiddleware } from '../auth'

type UserServiceDependency = Pick<import('./service').UserService, 'getUserAsUser'>;

function toUserProfile(
    userData: import('./schema').RedactedUser | import('./schema').User,
    currentUser: AuthenticatedUser,
) {
    const isCurrentUser = userData.id === currentUser.id;
    return {
        id: userData.id,
        name: userData.name,
        email: 'email' in userData ? userData.email : isCurrentUser ? currentUser.email : undefined,
        emailVerified: 'emailVerified' in userData ? userData.emailVerified : isCurrentUser ? currentUser.emailVerified : undefined,
        image: userData.image,
        isAdmin: isCurrentUser && currentUser.isAdmin,
    };
}

export function createUserModule(authMiddleware: ReturnType<typeof createAuthMiddleware>, userService: UserServiceDependency) {
    return new Elysia({ prefix: '/users', name: Modules.USER })
    .use(authMiddleware)
    .derive({ as: 'scoped' }, () => ({
        userService
    }))
    .get('/me', async ({ user, userService, status }) => {
        const result = await userService.getUserAsUser(user.id, user.id)
        if (!result.ok) {
            return status(result.error.status, { error: result.error })
        }
        return toUserProfile(result.value, user);
    }, { auth: true })
    .get('/:id', async ({ user, params, userService, status }) => {
        const result = await userService.getUserAsUser(user.id, params.id)
        if (!result.ok) {
            return status(result.error.status, { error: result.error })
        }
        return toUserProfile(result.value, user);
    }, {
        params: t.Object({
            id: t.String()
        }),
        auth: true
    })
}