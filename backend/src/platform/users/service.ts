import type { AppDatabase } from '../../db/connection'
import type { RedactedUser, User, UserWithProfile } from '../../db/schema'
import { user, userProfile } from '../../db/schema'
import { asc, eq } from 'drizzle-orm'
import { ok, err, type Result, type NotFoundError, type InternalError } from '../../lib/result'
import type { BadRequestError } from '../../lib/result'
import type { BroadcastPublisher } from '../realtime/service'
import type { UserProfileChangedEvent } from '$shared/dto/platform-event'
import { randomUUID } from 'node:crypto'

export class UserService {
    constructor(
        private readonly db: AppDatabase,
        private readonly broadcast: BroadcastPublisher = async () => ok(null),
        private readonly clock: () => Date = () => new Date(),
    ) {}

    async listUsers() {
        return await this.db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
            })
            .from(user)
            .orderBy(asc(user.name), asc(user.id));
    }

    async getUserById (id: string) : Promise<Result<UserWithProfile, NotFoundError>> {
        const [userData] = await this.db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                image: user.image,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                groups: user.groups,
                bio: userProfile.bio,
                accentColor: userProfile.accentColor,
            })
            .from(user)
            .leftJoin(userProfile, eq(userProfile.userId, user.id))
            .where(eq(user.id, id))
            .limit(1)

        if (!userData) return err({ status: 404, code: 'NOT_FOUND', message: 'User not found' })
        return ok({
            ...userData,
            bio: userData.bio,
            accentColor: userData.accentColor ?? '#6366f1',
        })
    }

    async getRedactedUserById (id: string) : Promise<Result<RedactedUser, NotFoundError>> {
        const [userData] = await this.db
            .select({
                id: user.id,
                name: user.name,
                image: user.image,
                createdAt: user.createdAt,
                bio: userProfile.bio,
                accentColor: userProfile.accentColor,
            })
            .from(user)
            .leftJoin(userProfile, eq(userProfile.userId, user.id))
            .where(eq(user.id, id))
            .limit(1)
        if (!userData) return err({ status: 404, code: 'NOT_FOUND', message: 'User not found' })
        return ok({ ...userData, accentColor: userData.accentColor ?? '#6366f1' })
    }

    async updateProfile(
        userId: string,
        input: { bio: string; accentColor: string },
    ): Promise<Result<{ bio: string | null; accentColor: string }, BadRequestError | InternalError>> {
        if (typeof input.bio !== 'string' || input.bio.length > 300 || typeof input.accentColor !== 'string'
            || !/^#[0-9a-fA-F]{6}$/.test(input.accentColor)) {
            return err({ status: 400, code: 'BAD_REQUEST', message: 'Die Profilangaben sind ungültig.' });
        }

        const profile = { bio: input.bio.trim() || null, accentColor: input.accentColor.toLowerCase() };
        try {
            const [existingUser] = await this.db.select({ id: user.id })
                .from(user)
                .where(eq(user.id, userId))
                .limit(1);
            if (!existingUser) {
                return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Das Profil konnte nicht gespeichert werden.' });
            }

            await this.db.insert(userProfile)
                .values({ userId, ...profile })
                .onConflictDoUpdate({
                    target: userProfile.userId,
                    set: profile,
                });
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Das Profil konnte nicht gespeichert werden.' });
        }

        const event: UserProfileChangedEvent = {
            id: randomUUID(),
            occurredAt: this.clock().toISOString(),
            type: 'user.profile.changed',
            action: 'UPDATED',
            entityId: userId,
        };
        try {
            await this.broadcast(['public'], event);
        } catch {
            // The database remains authoritative; visible profiles refetch on reconnect.
        }
        return ok(profile);
    }

    async getUserAsUser(currentUserId: string, targetUserId: string) : Promise<Result<RedactedUser|UserWithProfile, NotFoundError>> {
        if (currentUserId === targetUserId) {
            return await this.getUserById(targetUserId)
        }else {
            return await this.getRedactedUserById(targetUserId)
        }
    }

    async upsertUserAsSystem (data: { id: string; name: string; email: string; emailVerified?: boolean; image?: string|null; groups?: string }) : Promise<Result<User, InternalError>> {
        try {
            const result = await this.db.transaction(async (tx) => {
                const [upsertedUser] = await tx
                    .insert(user)
                    .values(data)
                    .onConflictDoUpdate({
                        target: user.id,
                        set: data
                    })
                    .returning();

                if (upsertedUser) {
                    await tx.insert(userProfile)
                        .values({ userId: upsertedUser.id })
                        .onConflictDoNothing();
                }

                return upsertedUser;
            });

            if (!result) return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to upsert user' });
            return ok(result);
        } catch {
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to upsert user' });
        }
    }
}