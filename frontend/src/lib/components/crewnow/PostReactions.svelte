<script lang="ts">
    import { onMount } from 'svelte';
    import { Popover } from 'bits-ui';
    import { api } from '$lib/api';
    import EmojiPicker from '$lib/components/EmojiPicker.svelte';
    import InlineText from '$lib/components/InlineText.svelte';
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';

    type Reaction = {
        id: string;
        emoji: string;
        user: { id: string; name: string; image: string | null };
    };
    type Props = {
        postId: string;
        count: number;
        reactionEmoji: string | null;
        onReactionsChange: (count: number, emoji: string | null) => void;
    };

    let { postId, count, reactionEmoji, onReactionsChange }: Props = $props();
    let open = $state(false);
    let reactions = $state<Reaction[]>([]);
    let loading = $state(false);
    let submitting = $state(false);
    let errorMessage = $state<string | null>(null);
    const gateway = getGatewayManager();
    const targetEventId = $derived(`crewnow.post:${encodeURIComponent(postId)}`);

    async function refresh() {
        loading = reactions.length === 0;
        try {
            const response = await api.reactions.targets({ targetType: 'crewnow.post' })({ targetId: postId }).get();
            if (response.error || !response.data) throw new Error('load failed');
            reactions = response.data.items as Reaction[];
            const sampledEmoji = reactions.length > 0
                ? reactions[Math.floor(Math.random() * reactions.length)]?.emoji ?? null
                : null;
            onReactionsChange(response.data.count, sampledEmoji);
            errorMessage = null;
        } catch {
            errorMessage = 'Reaktionen konnten nicht geladen werden. Bitte versuche es erneut.';
        } finally {
            loading = false;
        }
    }

    async function setReaction(emoji: string) {
        if (submitting) return;
        submitting = true;
        errorMessage = null;
        try {
            const response = await api.reactions.targets({ targetType: 'crewnow.post' })({ targetId: postId }).put({ emoji });
            if (response.error) throw new Error('update failed');
            await refresh();
        } catch {
            errorMessage = 'Deine Reaktion konnte nicht gespeichert werden. Bitte versuche es erneut.';
        } finally {
            submitting = false;
        }
    }

    onMount(() => {
        const unsubscribeReaction = gateway.onEvent('reaction.changed', (event) => {
            if (event.entityId === targetEventId && open) void refresh();
        });
        const unsubscribeConnected = gateway.onConnected(() => {
            if (open) void refresh();
        });
        return () => {
            unsubscribeReaction();
            unsubscribeConnected();
        };
    });
</script>

{#if count === 0}
        <EmojiPicker
            onSelect={(emoji) => void setReaction(emoji)}
            triggerLabel="Reaktion hinzufügen"
            triggerText=""
            triggerIcon="heart"
            triggerCount={0}
            triggerClass="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-surface-300-700/60 bg-surface-50-950/90 px-3 text-sm text-surface-800-200 shadow-md backdrop-blur transition-colors hover:text-error-700-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            contentZIndex="z-[80]"
        />
{:else}
    <Popover.Root bind:open onOpenChange={(isOpen) => { if (isOpen) void refresh(); }}>
        <Popover.Trigger
            type="button"
            class="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-surface-300-700/60 bg-surface-50-950/90 px-3 text-sm text-surface-800-200 shadow-md backdrop-blur transition-colors hover:text-error-700-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            aria-label={`${count} ${count === 1 ? 'Reaktion' : 'Reaktionen'} anzeigen`}
            title="Reaktionen anzeigen"
        >
            <InlineText text={reactionEmoji ?? '❤️'} class="text-xl leading-none" />
            <span>{count}</span>
        </Popover.Trigger>
        <Popover.Portal>
        <Popover.Content
            side="top"
            align="end"
            sideOffset={8}
            class="z-[70] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-surface-300-700/60 bg-surface-50-950 p-4 text-surface-950-50 shadow-xl outline-none"
        >
            <div class="flex items-center justify-between gap-3">
                <h2 class="font-semibold">Reaktionen <span class="text-sm font-normal text-surface-600-400">({count})</span></h2>
                <EmojiPicker onSelect={(emoji) => void setReaction(emoji)} triggerLabel="Reaktion hinzufügen" triggerText="Reagieren" contentZIndex="z-[80]" />
            </div>
            {#if loading}
                <p class="py-5 text-center text-sm text-surface-600-400" role="status">Reaktionen werden geladen …</p>
            {:else if reactions.length === 0}
                <p class="py-5 text-center text-sm text-surface-600-400">Noch keine Reaktionen. Reagiere zuerst.</p>
            {:else}
                <ul class="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
                    {#each reactions as reaction (reaction.id)}
                        <li class="flex items-center gap-2 rounded-xl bg-surface-100-900 px-2 py-2">
                            <ProfilePicture userId={reaction.user.id} image={reaction.user.image} name={reaction.user.name} size="h-8 w-8" />
                            <span class="min-w-0 flex-1 truncate text-sm font-medium">{reaction.user.name}</span>
                            <InlineText text={reaction.emoji} class="text-xl leading-none" />
                        </li>
                    {/each}
                </ul>
            {/if}
            {#if errorMessage}<p class="mt-3 text-sm text-error-700-300" role="alert">{errorMessage}</p>{/if}
            <p class="sr-only">Emoji auswählen, um zu reagieren. Dieselbe Reaktion erneut auszuwählen, entfernt sie.</p>
        </Popover.Content>
        </Popover.Portal>
    </Popover.Root>
{/if}