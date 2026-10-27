import type { AppDatabase } from '../../db/connection'
import type { RedactedUser, User } from '../../db/schema'
import { user } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { ok, err, type Result, type NotFoundError, type InternalError } from '../../lib/result'

export class UserService {
    constructor(private readonly db: AppDatabase) {}

    async getUserById (id: string) : Promise<Result<User, NotFoundError>> {
        const [userData] = await this.db
            .select()
            .from(user)
            .where(eq(user.id, id))
            .limit(1)

        if (!userData) return err({ status: 404, code: 'NOT_FOUND', message: 'User not found' })
        return ok(userData)
    }

    async getRedactedUserById (id: string) : Promise<Result<RedactedUser, NotFoundError>> {
        const [userData] = await this.db
            .select({
                id: user.id,
                name: user.name,
                image: user.image
            })
            .from(user)
            .where(eq(user.id, id))
            .limit(1)
        if (!userData) return err({ status: 404, code: 'NOT_FOUND', message: 'User not found' })
        return ok(userData)
    }

    async getUserAsUser(currentUserId: string, targetUserId: string) : Promise<Result<RedactedUser|User, NotFoundError>> {
        if (currentUserId === targetUserId) {
            return await this.getUserById(targetUserId)
        }else {
            return await this.getRedactedUserById(targetUserId)
        }
    }

    async upsertUserAsSystem (data: { id: string; name: string; email: string; emailVerified?: boolean; image?: string|null; groups?: string }) : Promise<Result<User, InternalError>> {
        const [result] = await this.db
            .insert(user)
            .values(data)
            .onConflictDoUpdate({
                target: user.id,
                set: data
            })
            .returning()

        if (!result) return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to upsert user' })

        return ok(result)
    }
}