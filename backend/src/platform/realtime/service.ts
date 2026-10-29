import type { User } from 'better-auth';
import * as jose from 'jose'
import { env } from "../../env";
import type { PlatformEvent } from '$shared/dto/platform-event';
import { RealtimeChannels } from '$shared/constants';
import { createLogger } from '../../lib/logger';
import { ok, err, type Result, type InternalError } from '../../lib/result';

const logger = createLogger('realtime');

export type CentrifugoBroadcastPayload = {
    channels: string[];
    data: PlatformEvent;
};
export type CentrifugoPublisher = (payload: CentrifugoBroadcastPayload) => Promise<Response>;
export type BroadcastPublisher = (channels: string[], data: PlatformEvent) => Promise<Result<null, InternalError>>;

export async function generateCentrifugoToken(user: User, deviceId: string): Promise<Result<string, InternalError>> {
    const channels = [
        `user:${user.id}`,
        `device:${user.id}:${deviceId}`,
        RealtimeChannels.ACTIVITY_FEED,
        'presence',
    ];
    return generateCentrifugoTokenForChannels(user, channels);
}

async function generateCentrifugoTokenForChannels(user: User, channels: string[]): Promise<Result<string, InternalError>> {
    const payload = {
        'sub': user.id,
        'exp': Math.floor(Date.now() / 1000) + 120,
        'channels': channels
    };
    try {
        const secret = new TextEncoder().encode(env.CENTRIFUGO_SECRET);
        const token = await new jose.SignJWT(payload)
            .setProtectedHeader({ alg: 'HS256' })
            .sign(secret);

        return ok(token);
    } catch (e) {
        logger.error('failed to sign centrifugo token', { userId: user.id, error: String(e) });
        return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to generate realtime token' });
    }
}

export function createCentrifugoPublisher(
    baseUrl: string,
    apiKey: string,
    fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch,
): CentrifugoPublisher {
    return async (payload) => {
        logger.debug('sending api broadcast');
        const response = await fetcher(`${baseUrl}/api/broadcast`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
                'X-Centrifugo-Error-Mode': 'transport',
            },
            body: JSON.stringify(payload),
        });
        logger.debug('centrifugo response', { status: response.status, statusText: response.statusText });
        return response;
    };
}

export function createBroadcastPublisher(publish: CentrifugoPublisher): BroadcastPublisher {
    return async (channels, data) => {
        const broadcastPayload = { channels, data };
        try {
            const response = await publish(broadcastPayload);
            if (!response.ok) {
                logger.error('failed to broadcast message', { status: response.status, statusText: response.statusText });
                return err({ status: 500, code: 'INTERNAL_ERROR', message: `Centrifugo broadcast failed: ${response.status} ${response.statusText}` });
            }
            return ok(null);
        } catch (error) {
            logger.error('failed to reach centrifugo for broadcast', { error: String(error) });
            return err({ status: 500, code: 'INTERNAL_ERROR', message: 'Failed to reach Centrifugo for broadcast' });
        }
    };
}