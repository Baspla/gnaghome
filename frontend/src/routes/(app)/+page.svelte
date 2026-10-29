<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import Button from '$lib/components/Button.svelte';
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';
    import Username from '$lib/components/Username.svelte';
    import { setPageTitle } from '$lib/utils';

    type Activity = {
        id: string;
        type: 'profile.updated' | 'profile.birthday' | 'counter.milestone';
        actor: { id: string; name: string; image: string | null } | null;
        subject: { id: string; name: string; image: string | null } | null;
        target: { type: string; id: string } | null;
        data: { changedFields?: Array<'name' | 'image'>; totalCount?: number };
        occurredAt: string;
    };

    type Cursor = { occurredAt: string; id: string };

    const PAGE_SIZE = 20;
    const gateway = getGatewayManager();
    let activities = $state<Activity[]>([]);
    let nextCursor = $state<Cursor | null>(null);
    let loading = $state(true);
    let loadingMore = $state(false);
    let errorMessage = $state<string | null>(null);
    let hasLoadedOnce = false;

    const dateFormatter = new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Berlin',
    });

    function activityDescription(activity: Activity): string {
        if (activity.type === 'profile.birthday') return 'hat heute Geburtstag.';
        if (activity.type === 'counter.milestone') return `hat den gemeinsamen Clicker auf ${activity.data.totalCount ?? 0} Klicks gebracht.`;
        if (activity.actor?.id === activity.subject?.id) return 'hat das eigene Profil aktualisiert.';
        return 'hat das Profil aktualisiert.';
    }

    async function loadActivities(append: boolean) {
        if (append) loadingMore = true;
        else loading = true;
        errorMessage = null;

        try {
            const response = await api['activity-feed'].get({
                query: {
                    limit: PAGE_SIZE,
                    ...(append && nextCursor ? {
                        beforeOccurredAt: nextCursor.occurredAt,
                        beforeId: nextCursor.id,
                    } : {}),
                },
            });
            if (response.error || !response.data) throw new Error('feed request failed');
            const page = response.data as { items: Activity[]; nextCursor: Cursor | null };
            activities = append ? [...activities, ...page.items] : page.items;
            nextCursor = page.nextCursor;
        } catch {
            errorMessage = append
                ? 'Ältere Aktivitäten konnten nicht geladen werden. Bitte versuche es erneut.'
                : 'Der Aktivitätsfeed konnte nicht geladen werden. Bitte versuche es erneut.';
        } finally {
            loading = false;
            loadingMore = false;
        }
    }

    onMount(() => {
        setPageTitle('Aktivitäten');
        const unsubscribeEvent = gateway.onEvent((event) => {
            if (event.type === 'activity-feed.changed') void loadActivities(false);
        });
        const unsubscribeConnected = gateway.onConnected(() => {
            if (hasLoadedOnce) void loadActivities(false);
        });
        void loadActivities(false).finally(() => hasLoadedOnce = true);

        return () => {
            unsubscribeEvent();
            unsubscribeConnected();
        };
    });
</script>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
    <header>
        <h1 class="text-3xl font-bold text-surface-950-50">Aktivitäten</h1>
    </header>

    <section class="overflow-hidden rounded-2xl border border-surface-300-700/40 bg-surface-100-900" aria-label="Aktivitätsliste">
        {#if loading}
            <p class="px-6 py-12 text-center text-surface-600-400" role="status">Aktivitäten werden geladen …</p>
        {:else if activities.length === 0 && !errorMessage}
            <p class="px-6 py-12 text-center text-surface-600-400">Noch keine Aktivitäten vorhanden.</p>
        {:else}
            <ol class="divide-y divide-surface-300-700/40">
                {#each activities as activity (activity.id)}
                    <li class="flex gap-4 px-4 py-5 sm:px-6">
                        <div class="flex shrink-0 -space-x-2">
                            {#if activity.actor}
                                <ProfilePicture
                                    image={activity.actor.image}
                                    name={activity.actor.name}
                                    size="h-10 w-10"
                                    class="border-2 border-surface-100-900"
                                />
                            {:else if activity.subject}
                                <ProfilePicture
                                    image={activity.subject.image}
                                    name={activity.subject.name}
                                    size="h-10 w-10"
                                    class="border-2 border-surface-100-900"
                                />
                            {/if}
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm leading-6 text-surface-700-300">
                                {#if activity.actor}
                                    <Username
                                        userId={activity.actor.id}
                                        name={activity.actor.name}
                                        class="font-semibold text-surface-950-50"
                                    />
                                {:else if activity.subject}
                                    <Username
                                        userId={activity.subject.id}
                                        name={activity.subject.name}
                                        class="font-semibold text-surface-950-50"
                                    />
                                {/if}
                                {#if activity.type === 'counter.milestone'}
                                    <span>{activityDescription(activity)}</span>
                                {:else if activity.type === 'profile.updated' && activity.subject && activity.actor?.id !== activity.subject.id}
                                    <span>hat das Profil von </span>
                                    <Username
                                        userId={activity.subject.id}
                                        name={activity.subject.name}
                                        class="font-semibold text-surface-950-50"
                                    />
                                    <span> aktualisiert.</span>
                                {:else}
                                    <span>{activityDescription(activity)}</span>
                                {/if}
                            </p>
                            <time class="mt-1 block text-xs text-surface-600-400" datetime={activity.occurredAt}>
                                {dateFormatter.format(new Date(activity.occurredAt))}
                            </time>
                        </div>
                    </li>
                {/each}
            </ol>
        {/if}

        {#if errorMessage}
            <div class="px-6 py-4" role="alert">
                <p class="text-sm text-error-600-400">{errorMessage}</p>
                {#if activities.length === 0}
                    <Button type="button" onclick={() => void loadActivities(false)} class="mt-3">
                        Erneut versuchen
                    </Button>
                {/if}
            </div>
        {/if}
    </section>

    {#if nextCursor}
        <div class="flex justify-center">
            <Button type="button" onclick={() => void loadActivities(true)} disabled={loadingMore}>
                {loadingMore ? 'Wird geladen …' : 'Ältere Aktivitäten laden'}
            </Button>
        </div>
    {/if}
</main>