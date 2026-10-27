import { getContext, setContext } from "svelte";
import type { GatewayManager } from "./gateway-manager.svelte";

const GatewayManager_KEY = Symbol("gateway-manager");

export function setGatewayManager(manager: GatewayManager): void {
    setContext(GatewayManager_KEY, manager);
}

export function getGatewayManager(): GatewayManager {
    const manager = getContext<GatewayManager>(GatewayManager_KEY);
    if (!manager) {
        throw new Error(
            "GatewayManager not found in context. Make sure to wrap your component tree in a <GatewayProvider>.",
        );
    }
    return manager;
}