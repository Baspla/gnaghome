<script lang="ts">
    import { onMount } from 'svelte';
    import { Label, Switch } from 'bits-ui';
    import { api } from '$lib/api';
    import Button from '$lib/components/Button.svelte';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';

    type Topic = {
        id: string;
        appId: string;
        label: string;
        description: string;
        enabled: boolean;
    };

    const appLabels: Record<string, string> = {
        crewnow: 'CrewNow',
        discussions: 'Diskussionen',
    };

    let topics = $state<Topic[]>([]);
    let vapidPublicKey = $state<string | null>(null);
    let subscriptionsCount = $state(0);
    let activeSubscription = $state<PushSubscription | null>(null);
    let subscriptionSyncInProgress = false;
    let subscriptionSynced = false;
    let permission = $state<NotificationPermission | 'unsupported'>('unsupported');
    let loading = $state(true);
    let pendingTopicId = $state<string | null>(null);
    let pendingSubscription = $state(false);
    let errorMessage = $state<string | null>(null);
    let successMessage = $state<string | null>(null);
    const gateway = getGatewayManager();

    const groups = $derived.by(() => {
        const grouped: Record<string, Topic[]> = Object.create(null) as Record<string, Topic[]>;
        for (const topic of topics) {
            const group = grouped[topic.appId] ?? [];
            group.push(topic);
            grouped[topic.appId] = group;
        }
        return Object.entries(grouped);
    });

    function encodeApplicationServerKey(value: string): ArrayBuffer {
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }

    async function refreshSettings() {
        loading = true;
        errorMessage = null;
        try {
            const response = await api.notifications.settings.get();
            if (response.error || !response.data) throw new Error('Einstellungen konnten nicht geladen werden.');
            topics = response.data.topics;
            vapidPublicKey = response.data.vapidPublicKey;
            subscriptionsCount = response.data.subscriptionsCount;
            if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
                permission = Notification.permission;
                const registration = await navigator.serviceWorker.getRegistration();
                activeSubscription = await registration?.pushManager.getSubscription() ?? null;
                if (activeSubscription && permission === 'granted' && !subscriptionSynced && !subscriptionSyncInProgress) {
                    subscriptionSyncInProgress = true;
                    try {
                        const json = activeSubscription.toJSON();
                        if (json.endpoint && json.keys?.p256dh && json.keys.auth) {
                            const sync = await api.notifications.subscriptions.post({
                                endpoint: json.endpoint,
                                keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
                            });
                            if (sync.error) throw new Error('Registrierung fehlgeschlagen');
                            subscriptionSynced = true;
                        }
                    } finally {
                        subscriptionSyncInProgress = false;
                    }
                }
            }
        } catch {
            errorMessage = 'Benachrichtigungseinstellungen konnten nicht geladen werden.';
        } finally {
            loading = false;
        }
    }

    async function updateTopic(topic: Topic, enabled: boolean) {
        const previous = topic.enabled;
        topic.enabled = enabled;
        pendingTopicId = topic.id;
        errorMessage = null;
        successMessage = null;
        try {
            const response = await api.notifications.preferences({ topicId: topic.id }).put({ enabled });
            if (response.error) throw new Error('Speichern fehlgeschlagen');
        } catch {
            topic.enabled = previous;
            errorMessage = 'Die Auswahl konnte nicht gespeichert werden. Bitte versuche es erneut.';
        } finally {
            pendingTopicId = null;
        }
    }

    async function enablePush() {
        if (!vapidPublicKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        pendingSubscription = true;
        errorMessage = null;
        successMessage = null;
        try {
            permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                errorMessage = permission === 'denied'
                    ? 'Der Browser hat Benachrichtigungen blockiert. Ändere die Berechtigung in den Browsereinstellungen.'
                    : 'Bitte erlaube Benachrichtigungen im Browser.';
                return;
            }
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: encodeApplicationServerKey(vapidPublicKey),
            });
            const json = subscription.toJSON();
            if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('Ungültiges Abo');
            const response = await api.notifications.subscriptions.post({
                endpoint: json.endpoint,
                keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
            });
            if (response.error) {
                await subscription.unsubscribe();
                throw new Error('Registrierung fehlgeschlagen');
            }
            activeSubscription = subscription;
            subscriptionSynced = true;
            await refreshSettings();
            successMessage = 'Benachrichtigungen sind für dieses Gerät aktiviert.';
        } catch {
            errorMessage = 'Dieses Gerät konnte nicht für Push-Benachrichtigungen registriert werden.';
        } finally {
            pendingSubscription = false;
        }
    }

    async function disablePush() {
        if (!activeSubscription) return;
        pendingSubscription = true;
        errorMessage = null;
        successMessage = null;
        try {
            const response = await api.notifications.subscriptions.delete({ endpoint: activeSubscription.endpoint });
            if (response.error) throw new Error('Entfernen fehlgeschlagen');
            await activeSubscription.unsubscribe();
            activeSubscription = null;
            subscriptionSynced = false;
            await refreshSettings();
            successMessage = 'Push-Benachrichtigungen sind für dieses Gerät deaktiviert.';
        } catch {
            errorMessage = 'Die Push-Registrierung konnte nicht entfernt werden.';
        } finally {
            pendingSubscription = false;
        }
    }

    onMount(() => {
        const unsubscribeEvent = gateway.onEvent((event) => {
            if (event.type === 'notification-settings.changed') void refreshSettings();
        });
        const unsubscribeConnected = gateway.onConnected(() => void refreshSettings());
        void refreshSettings();
        return () => {
            unsubscribeEvent();
            unsubscribeConnected();
        };
    });
</script>

<div class="flex flex-col gap-5">
    <div>
        <h2 class="font-semibold">Push-Benachrichtigungen</h2>
        <p class="mt-1 text-sm text-surface-contrast-400-800">Wähle aus, über welche Ereignisse du informiert werden möchtest. Themen sind standardmäßig ausgeschaltet.</p>
    </div>

    {#if loading}
        <p class="text-sm text-surface-contrast-400-800" role="status">Einstellungen werden geladen …</p>
    {:else}
        <section class="rounded-lg border border-surface-300-700 p-4" aria-labelledby="push-device-title">
            <h3 id="push-device-title" class="font-medium">Dieses Gerät</h3>
            {#if !vapidPublicKey}
                <p class="mt-2 text-sm text-surface-contrast-400-800">Push-Benachrichtigungen sind auf dem Server noch nicht eingerichtet.</p>
            {:else if permission === 'unsupported'}
                <p class="mt-2 text-sm text-surface-contrast-400-800">Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>
            {:else if activeSubscription}
                <p class="mt-2 text-sm text-surface-contrast-400-800">Dieses Gerät ist registriert. Registrierte Geräte insgesamt: {subscriptionsCount}.</p>
                <Button type="button" variant="outlined" class="mt-3" disabled={pendingSubscription} onclick={() => void disablePush()}>
                    {pendingSubscription ? 'Wird deaktiviert …' : 'Push für dieses Gerät deaktivieren'}
                </Button>
            {:else}
                <p class="mt-2 text-sm text-surface-contrast-400-800">Aktiviere Push auf diesem Gerät, um ausgewählte Themen auch außerhalb der App zu erhalten.</p>
                <Button type="button" class="mt-3" disabled={pendingSubscription || permission === 'denied'} onclick={() => void enablePush()}>
                    {pendingSubscription ? 'Wird aktiviert …' : 'Push für dieses Gerät aktivieren'}
                </Button>
                {#if permission === 'denied'}
                    <p class="mt-2 text-sm text-warning-700-300">Benachrichtigungen sind im Browser blockiert. Ändere die Berechtigung in den Browsereinstellungen.</p>
                {/if}
            {/if}
        </section>

        {#each groups as [appId, appTopics] (appId)}
            <section class="flex flex-col gap-3" aria-labelledby={`notification-app-${appId}`}>
                <h3 id={`notification-app-${appId}`} class="font-semibold">{appLabels[appId] ?? appId}</h3>
                {#each appTopics as topic (topic.id)}
                    <div class="flex items-center justify-between gap-4 rounded-lg border border-surface-300-700 p-3">
                        <div class="min-w-0">
                            <Label.Root for={`notification-${topic.id}`} class="font-medium">{topic.label}</Label.Root>
                            <p class="mt-1 text-sm text-surface-contrast-400-800">{topic.description}</p>
                        </div>
                        <Switch.Root
                            id={`notification-${topic.id}`}
                            checked={topic.enabled}
                            disabled={pendingTopicId === topic.id}
                            aria-label={topic.label}
                            onCheckedChange={(checked) => void updateTopic(topic, checked)}
                            class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary-500 data-[state=unchecked]:bg-surface-300-700"
                        >
                            <Switch.Thumb class="pointer-events-none block h-5 w-5 rounded-full bg-surface-50-950 shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5" />
                        </Switch.Root>
                    </div>
                {/each}
            </section>
        {/each}
    {/if}

    {#if errorMessage}<p class="text-sm text-error-700-300" role="alert">{errorMessage}</p>{/if}
    {#if successMessage}<p class="text-sm text-success-700-300" role="status">{successMessage}</p>{/if}
</div>