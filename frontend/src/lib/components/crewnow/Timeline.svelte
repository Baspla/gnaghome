<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$lib/api';
    import Button from '$lib/components/Button.svelte';
    import PostCard from './PostCard.svelte';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';

    type Person = { id: string; name: string; image: string | null };
    type Post = {
        id: string;
        author: Person;
        backImage: { id: string; url: string };
        frontImage: { id: string; url: string };
        caption: string | null;
        taggedUsers: Person[];
        createdAt: string;
        updatedAt: string;
        canEdit: boolean;
    };
    type Cursor = { createdAt: string; id: string };

    let posts = $state<Post[]>([]);
    let nextCursor = $state<Cursor | null>(null);
    let loading = $state(true);
    let loadingMore = $state(false);
    let errorMessage = $state<string | null>(null);
    let deleteTarget = $state<Post | null>(null);
    let deleting = $state(false);
    let sentinel: HTMLDivElement | undefined = $state();
    let observer: IntersectionObserver | undefined;
    const gateway = getGatewayManager();
    let hasLoadedOnce = false;

    async function loadPage(append: boolean) {
        if (append) loadingMore = true;
        else loading = true;
        errorMessage = null;
        try {
            const response = await api.crewnow.timeline.get({
                query: {
                    limit: 20,
                    ...(append && nextCursor ? { beforeCreatedAt: nextCursor.createdAt, beforeId: nextCursor.id } : {}),
                },
            });
            if (response.error || !response.data) throw new Error('Timeline request failed');
            const data = response.data as { items: Post[]; nextCursor: Cursor | null };
            if (append) {
                const currentIds = new Set(posts.map((post) => post.id));
                posts = [...posts, ...data.items.filter((post) => !currentIds.has(post.id))];
            } else {
                posts = data.items;
            }
            nextCursor = data.nextCursor;
        } catch {
            errorMessage = 'Die CrewNow-Timeline konnte nicht geladen werden. Bitte versuche es erneut.';
        } finally {
            loading = false;
            loadingMore = false;
        }
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        deleting = true;
        errorMessage = null;
        try {
            const response = await api.crewnow.posts({ id: deleteTarget.id }).delete();
            if (response.error) throw new Error('Delete failed');
            posts = posts.filter((post) => post.id !== deleteTarget?.id);
            deleteTarget = null;
        } catch {
            errorMessage = 'Der Post konnte nicht gelöscht werden. Bitte versuche es erneut.';
        } finally {
            deleting = false;
        }
    }

    onMount(() => {
        const unsubscribeEvent = gateway.onEvent((event) => {
            if (event.type === 'activity-feed.changed') void loadPage(false);
        });
        const unsubscribeConnected = gateway.onConnected(() => {
            if (hasLoadedOnce) void loadPage(false);
        });
        void loadPage(false).finally(() => hasLoadedOnce = true);
        observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting) && nextCursor && !loadingMore && !loading) {
                void loadPage(true);
            }
        }, { rootMargin: '500px 0px' });
        if (sentinel) observer.observe(sentinel);
        return () => {
            observer?.disconnect();
            unsubscribeEvent();
            unsubscribeConnected();
        };
    });
</script>

<section class="flex w-full flex-col gap-5">
    {#if loading}
        <p class="py-12 text-center text-surface-600-400" role="status">CrewNows werden geladen …</p>
    {:else if posts.length === 0 && !errorMessage}
        <div class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900 px-6 py-12 text-center">
            <h2 class="text-lg font-semibold text-surface-950-50">Noch keine CrewNows</h2>
            <p class="mt-2 text-sm text-surface-600-400">Teile das erste Bild mit deiner Gruppe.</p>
            <a href="/crewnow/create" class="btn preset-filled mt-5 inline-flex">Neuer Post</a>
        </div>
    {:else}
        {#each posts as post (post.id)}
            <PostCard {post} onDelete={(target) => deleteTarget = target} />
        {/each}
    {/if}

    {#if errorMessage}
        <div class="rounded-xl bg-error-100-900 p-4 text-center text-sm text-error-800-200" role="alert">
            <p>{errorMessage}</p>
            <Button type="button" class="mt-3" onclick={() => void loadPage(false)}>Erneut versuchen</Button>
        </div>
    {/if}

    <div bind:this={sentinel} class="flex min-h-12 justify-center py-3" aria-live="polite">
        {#if loadingMore}<span class="text-sm text-surface-600-400">Weitere CrewNows werden geladen …</span>
        {:else if nextCursor}<button type="button" class="text-sm text-primary-700-300 underline" onclick={() => void loadPage(true)}>Weitere CrewNows laden</button>
        {:else if posts.length > 0}<span class="text-sm text-surface-600-400">Du hast das Ende erreicht.</span>{/if}
    </div>
</section>

{#if deleteTarget}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-surface-950/70 p-4" role="presentation" onclick={(event) => { if (event.target === event.currentTarget && !deleting) deleteTarget = null; }} onkeydown={(event) => { if (event.key === 'Escape' && !deleting) deleteTarget = null; }}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" class="w-full max-w-md rounded-2xl bg-surface-50-950 p-6 shadow-xl">
            <h2 id="delete-title" class="text-xl font-semibold text-surface-950-50">CrewNow löschen?</h2>
            <p id="delete-description" class="mt-2 text-sm text-surface-700-300">Dieser Post und seine Bilder werden endgültig gelöscht.</p>
            {#if errorMessage}<p class="mt-3 text-sm text-error-700-300" role="alert">{errorMessage}</p>{/if}
            <div class="mt-6 flex justify-end gap-3">
                <Button type="button" variant="outlined" disabled={deleting} onclick={() => deleteTarget = null}>Abbrechen</Button>
                <Button type="button" disabled={deleting} class="bg-error-500 text-error-contrast-500" onclick={() => void confirmDelete()}>{deleting ? 'Wird gelöscht …' : 'Endgültig löschen'}</Button>
            </div>
        </div>
    </div>
{/if}