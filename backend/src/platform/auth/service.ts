import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { env } from "../../env";
import type { AppDatabase } from '../../db/connection';
import { createLogger } from "../../lib/logger";

const logger = createLogger('auth');

type UserProvisioner = Pick<import('../users/service').UserService, 'upsertUserAsSystem'>;

export function createAuth(db: AppDatabase, userService: UserProvisioner) {
    return betterAuth({
	secret: env.BETTER_AUTH_SECRET || undefined,
	database: drizzleAdapter(db, {
		provider: "sqlite",
	}),
	user: {
		additionalFields: {
			groups: {
				type: "string",
				default: "[]",
			},
		}
	},
	logger: {
		level: env.BETTER_AUTH_LOG_LEVEL as "error" | "warn" | "info" | "debug" || "info",
		disabled: false,
		log: (level, message, ...args) => {
			switch (level) {
				case "error":
					logger.error(message, args);
					break;
				case "warn":
					logger.warn(message, args);
					break;
				case "info":
					logger.info(message, args);
					break;
				case "debug":
					logger.debug(message, args);
					break;
			}
		}
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					logger.info('new user created', { userId: user.id });
                    const result = await userService.upsertUserAsSystem({
						id: user.id,
						name: user.name,
						email: user.email,
						emailVerified: user.emailVerified,
						image: user.image,
					});
					if (!result.ok) {
						logger.error('error upserting user', { userId: user.id, error: result.error.message });
					}
				}
			}
		},
		session: {
			create: {
				after: async (session) => {
					logger.info('new session created', { sessionId: session.id, userId: session.userId });
				}
			},
			delete: {
				after: async (session) => {
					logger.info('session deleted', { sessionId: session.id, userId: session.userId });
				}
			}
		}
	},
	plugins: [genericOAuth({
		config: [
			{
				providerId: env.OAUTH_PROVIDER_ID,
				clientId: env.OAUTH_CLIENT_ID!,
				clientSecret: env.OAUTH_CLIENT_SECRET!,
				discoveryUrl: env.OAUTH_DISCOVERY_URL!,
				redirectURI: `${env.BETTER_AUTH_URL}/api/betterauth/auth/callback/${env.OAUTH_PROVIDER_ID}`,
				scopes: ["openid", "profile", "email", "groups"],
				overrideUserInfo: true,
				mapProfileToUser: async (profile: unknown) => {
					const oauthProfile = (profile ?? {}) as Record<string, unknown>;
					const email = typeof oauthProfile.email === "string" ? oauthProfile.email : "";
					const fallbackName = email.includes("@") ? email.split("@")[0] : "user";
					const user = {
						name:
							typeof oauthProfile.display_name === "string"
								? oauthProfile.display_name
								: typeof oauthProfile.preferred_username === "string"
									? oauthProfile.preferred_username
									: typeof oauthProfile.name === "string"
										? oauthProfile.name
										: fallbackName,
						email,
						image: typeof oauthProfile.picture === "string" ? oauthProfile.picture : undefined,
						emailVerified: Boolean(oauthProfile.email_verified),
						groups: JSON.stringify(Array.isArray(oauthProfile.groups) ? oauthProfile.groups : []),
					};
					return user;
				},
			},
		],
	}),
	],
	baseURL: env.BETTER_AUTH_URL,
	basePath: "/auth",
	trustedOrigins: [env.BETTER_AUTH_URL, env.API_URL_INTERNAL],
    });
}

