<script lang="ts">
    import { getCustomEmojis } from '$lib/custom-emoji-catalog.svelte';
    import { parseCustomEmojiText } from '$lib/custom-emoji-text';

    type Props = { text: string; class?: string };

    let { text, class: className }: Props = $props();
    const catalog = $derived(getCustomEmojis());
    const parts = $derived(parseCustomEmojiText(text, catalog));
</script>

<span class={className}>
    {#each parts as part, index (`${part.kind}-${index}`)}
        {#if part.kind === 'emoji'}
            <img
                src={part.url}
                alt={`:${part.name}:`}
                title={`:${part.name}:`}
                class="inline-block h-[1em] w-[1em] max-h-[1em] max-w-[1em] align-[-0.15em] object-contain"
            />
        {:else}
            {part.value}
        {/if}
    {/each}
</span>