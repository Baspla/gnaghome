import { page } from "$app/state";
import { env } from "$env/dynamic/public";
import { api } from "$lib/api";
import type { PlatformEvent } from "$shared/dto/platform-event";
import { Centrifuge, type PublicationContext } from "centrifuge";
import { createLogger } from "$lib/logger";
import { toaster } from "$lib/toaster";

const logger = createLogger("gateway");

type PlatformEventHandler = (event: PlatformEvent) => void;

export class GatewayManager {
    private getToken = async () => {
        // only call this from the browser, not from server-side rendering
        if (typeof window === "undefined") {
            return "";
        }
        const token = await api.gateway.token
            .get({ query: { deviceId: "default" } })
            .then((res) => {
                return res.data?.token;
            });
        return token || "";
    };
    private userId = page.data?.user?.id;

    private centrifuge = $state<Centrifuge>(
        new Centrifuge(
            env.PUBLIC_GNAGHOME_CENTRIFUGO_WS_ENDPOINT || "http://localhost:8000",
            {
                getToken: this.getToken,
                maxReconnectDelay: 10000, // default is 2000
                // Only enable Centrifuge debug logging when our log level is debug
                //debug: getConfiguredLevel() === "debug",
            },
        ),
    );

    private handlers = new Set<PlatformEventHandler>();

    /**
     * Register a handler for a specific event type.
     * Returns an unsubscribe function.
     */
    onEvent(handler: PlatformEventHandler): () => void {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    connect() {
        logger.info("connecting to Centrifugo");
        this.centrifuge.on("error", (context) => {
            logger.error(context.error.message)
            if(context.error.message == "transport closed"){
                toaster.error({
                    title: "Error connecting to Realtime Messaging Server",
                })
            }
        });
        this.centrifuge.on("connected", (context) => {
            logger.info("Centrifugo connected");
            if (!this.userId) {
                logger.error("no user ID found");
                return;
            }
            try {
                const sub = this.centrifuge.newSubscription("user:" + this.userId, {
                    getToken: this.getToken,
                })
                sub.subscribe();
                sub.on("publication", (context: PublicationContext) => {
                    this.handlePlatformEvent(context.data as PlatformEvent);
                });
            } catch (error) {
                logger.error("failed to subscribe to user channel", { userId: this.userId, error: String(error) });
            }
        });
        this.centrifuge.on("disconnected", (context) => {
            logger.info("Centrifugo disconnected");
        });
        this.centrifuge.connect();
    }

    private handlePlatformEvent(event: PlatformEvent) {
        logger.debug("received platform event", { type: event.type, eventId: event.id });
        for (const handler of this.handlers) handler(event);
    }

    disconnect() {
        this.centrifuge.disconnect();
    }
}
