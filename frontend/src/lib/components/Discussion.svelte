<script lang="ts">
    import { onMount } from 'svelte';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import Button from '$lib/components/Button.svelte';
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';
    import { page } from '$app/state';
    import { Label } from 'bits-ui';
    import { SquarePen, Trash } from '@lucide/svelte';

    type Message = {
        id: string;
        discussionId: string;
        body: string;
        author: { id: string; name: string; image: string | null };
        canEdit: boolean;
        createdAt: string;
        editedAt: string | null;
    };
    type Props = { discussionId: string };

    let { discussionId }: Props = $props();
    let messages = $state<Message[]>([]);
    let body = $state('');
    let loading = $state(true);
    let submitting = $state(false);
    let activeEditId = $state<string | null>(null);
    let editBody = $state('');
    let savingEdit = $state(false);
    let deletingId = $state<string | null>(null);
    let errorMessage = $state<string | null>(null);
    const gateway = getGatewayManager();
    const currentUserId = $derived(page.data.user?.id ?? '');

    async function loadMessages() {
        loading = messages.length === 0;
        try {
            const response = await api.discussions({ discussionId }).messages.get();
            if (response.error || !response.data) throw new Error('load failed');
            messages = response.data.items as Message[];
            errorMessage = null;
        } catch {
            errorMessage = 'Kommentare konnten nicht geladen werden. Bitte versuche es erneut.';
        } finally {
            loading = false;
        }
    }

    async function submitComment(event: SubmitEvent) {
        event.preventDefault();
        const submittedBody = body.trim();
        if (!submittedBody || submitting) return;
        submitting = true;
        errorMessage = null;
        try {
            const response = await api.discussions({ discussionId }).messages.post({ body: submittedBody });
            if (response.error) throw new Error('create failed');
            body = '';
            await loadMessages();
        } catch {
            errorMessage = 'Der Kommentar konnte nicht gesendet werden. Bitte versuche es erneut.';
        } finally {
            submitting = false;
        }
    }

    function startEdit(message: Message) {
        activeEditId = message.id;
        editBody = message.body;
    }

    async function saveEdit(messageId: string) {
        const submittedBody = editBody.trim();
        if (!submittedBody || savingEdit) return;
        savingEdit = true;
        errorMessage = null;
        try {
            const response = await api.discussions.messages({ messageId }).patch({ body: submittedBody });
            if (response.error) throw new Error('edit failed');
            activeEditId = null;
            await loadMessages();
        } catch {
            errorMessage = 'Der Kommentar konnte nicht gespeichert werden. Bitte versuche es erneut.';
        } finally {
            savingEdit = false;
        }
    }

    async function deleteMessage(messageId: string) {
        if (deletingId) return;
        deletingId = messageId;
        errorMessage = null;
        try {
            const response = await api.discussions.messages({ messageId }).delete();
            if (response.error) throw new Error('delete failed');
            await loadMessages();
        } catch {
            errorMessage = 'Der Kommentar konnte nicht gelöscht werden. Bitte versuche es erneut.';
        } finally {
            deletingId = null;
        }
    }

    onMount(() => {
        const unsubscribeEvent = gateway.onEvent((event) => {
            if (event.type === 'discussion.changed') void loadMessages();
        });
        const unsubscribeConnected = gateway.onConnected(() => void loadMessages());
        void loadMessages();
        return () => {
            unsubscribeEvent();
            unsubscribeConnected();
        };
    });
</script>

<section id="comments" class="rounded-2xl border border-surface-300-700/40 bg-surface-100-900 p-4 sm:p-5" aria-labelledby="discussion-heading">
    <h2 id="discussion-heading" class="text-lg font-semibold text-surface-950-50">Kommentare <span class="text-sm font-normal text-surface-600-400">({messages.length})</span></h2>

    <form class="mt-4 flex flex-col gap-3" onsubmit={submitComment}>
        <Label.Root for={`new-comment-${discussionId}`} class="sr-only">Kommentar schreiben</Label.Root>
        <textarea
            id={`new-comment-${discussionId}`}
            bind:value={body}
            maxlength="5000"
            rows="3"
            placeholder="Schreibe einen Kommentar …"
            class="min-h-24 w-full resize-y rounded-xl border border-surface-300-700/60 bg-surface-50-950 px-3 py-2 text-sm text-surface-950-50 placeholder:text-surface-500-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        ></textarea>
        <div class="flex items-center justify-between gap-3">
            <span class="text-xs text-surface-600-400">Als {page.data.user?.name ?? 'du'}</span>
            <Button type="submit" disabled={submitting || !body.trim()}>{submitting ? 'Wird gesendet …' : 'Kommentieren'}</Button>
        </div>
    </form>

    {#if errorMessage}
        <p class="mt-4 text-sm text-error-700-300" role="alert">{errorMessage}</p>
    {/if}

    {#if loading}
        <p class="py-6 text-center text-sm text-surface-600-400" role="status">Kommentare werden geladen …</p>
    {:else if messages.length === 0}
        <p class="py-6 text-center text-sm text-surface-600-400">Noch keine Kommentare. Starte die Unterhaltung.</p>
    {:else}
        <ol class="mt-5 flex flex-col gap-4">
            {#each messages as message (message.id)}
                <li class="flex gap-3 border-t border-surface-300-700/30 pt-4">
                    <ProfilePicture image={message.author.image} name={message.author.name} size="h-9 w-9" />
                    <div class="min-w-0 flex-1">
                        <div class="flex items-start justify-between gap-2">
                            <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span class="text-sm font-semibold text-surface-950-50">{message.author.name}</span>
                                <time class="text-xs text-surface-600-400" datetime={message.createdAt}>{new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.createdAt))}</time>
                                {#if message.editedAt}<span class="text-xs italic text-surface-500-400">(bearbeitet)</span>{/if}
                            </div>
                            {#if message.canEdit && message.author.id === currentUserId && activeEditId !== message.id}
                                <div class="-mr-2 -mt-2 flex shrink-0 gap-1">
                                    <button type="button" class="rounded-lg p-2 text-primary-700-300 hover:bg-surface-200-800" aria-label="Kommentar bearbeiten" title="Kommentar bearbeiten" onclick={() => startEdit(message)}>
                                        <SquarePen class="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <button type="button" class="rounded-lg p-2 text-error-700-300 hover:bg-error-100-900 disabled:opacity-50" aria-label="Kommentar löschen" title={deletingId === message.id ? 'Wird gelöscht …' : 'Kommentar löschen'} disabled={deletingId === message.id} onclick={() => void deleteMessage(message.id)}>
                                        <Trash class="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                            {/if}
                        </div>
                        {#if activeEditId === message.id}
                            <form class="mt-2 flex flex-col gap-2" onsubmit={(event) => { event.preventDefault(); void saveEdit(message.id); }}>
                                <Label.Root class="sr-only" for={`edit-${message.id}`}>Kommentar bearbeiten</Label.Root>
                                <textarea id={`edit-${message.id}`} bind:value={editBody} maxlength="5000" rows="3" class="min-h-24 w-full resize-y rounded-xl border border-surface-300-700/60 bg-surface-50-950 px-3 py-2 text-sm text-surface-950-50 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"></textarea>
                                <div class="flex gap-2">
                                    <Button type="submit" disabled={savingEdit || !editBody.trim()}>{savingEdit ? 'Wird gespeichert …' : 'Speichern'}</Button>
                                    <Button type="button" variant="outlined" disabled={savingEdit} onclick={() => activeEditId = null}>Abbrechen</Button>
                                </div>
                            </form>
                        {:else}
                            <p class="mt-1 whitespace-pre-wrap break-words text-sm text-surface-800-200">{message.body}</p>
                        {/if}
                    </div>
                </li>
            {/each}
        </ol>
    {/if}
</section>