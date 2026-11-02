<script lang="ts">
    import { Popover } from 'bits-ui';
    import { Smile } from '@lucide/svelte';

    type Emoji = { value: string; label: string };
    type Props = { onSelect: (emoji: string) => void };

    let { onSelect }: Props = $props();
    let open = $state(false);
    const pickerId = $props.id();

    const normalEmojis: Emoji[] = [
        { value: '🔥', label: 'Feuer' },
        { value: '♥️', label: 'Herz' },
        { value: '😂', label: 'Lachen mit Tränen' },
        { value: '🥰', label: 'Verliebt' },
        { value: '😭', label: 'Weinen' },
        { value: '👀', label: 'Augen' },
        { value: '🎉', label: 'Konfetti' },
        { value: '😅', label: 'Lächeln mit Schweiß' },
        { value: '💀', label: 'Totenkopf' },
        { value: '👍', label: 'Daumen hoch' },
        { value: '👋', label: 'Winken' },
        { value: '😎', label: 'Cool' },
        { value: '🥵', label: 'Heiß' },
        { value: '😵‍💫', label: 'Benommen' },
        { value: '😡', label: 'Wütend' },
        { value: '🫣', label: 'Durch die Finger schauen' },
        { value: '🤓', label: 'Nerd' },
        { value: '💩', label: 'Kackhaufen' },
        { value: '🫪', label: 'Blasen' },
    ];

    function chooseEmoji(emoji: Emoji) {
        onSelect(emoji.value);
        open = false;
    }
</script>

<Popover.Root bind:open>
    <Popover.Trigger
        type="button"
        class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-surface-700-300 hover:bg-surface-200-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-label="Emoji auswählen"
        title="Emoji einfügen"
    >
        <Smile class="h-4 w-4" aria-hidden="true" />
        <span>Emoji</span>
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            class="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-surface-300-700 bg-surface-50-950 p-3 shadow-lg"
            align="start"
            sideOffset={8}
            aria-label="Emoji auswählen"
        >
            <div class="max-h-[min(17rem,70dvh)] space-y-3 overflow-y-auto">
                <section aria-labelledby={`${pickerId}-normal-emojis-heading`}>
                    <h3 id={`${pickerId}-normal-emojis-heading`} class="mb-1 px-1 text-xs font-medium text-surface-600-400">Normale Emojis</h3>
                    <div class="grid grid-cols-5 gap-1 sm:grid-cols-6">
                        {#each normalEmojis as emoji (emoji.value)}
                            <button
                                type="button"
                                class="flex h-9 items-center justify-center rounded-lg text-xl leading-none hover:bg-surface-200-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-10 sm:text-2xl"
                                aria-label={`${emoji.label} einfügen`}
                                title={emoji.label}
                                onclick={() => chooseEmoji(emoji)}
                            >
                                {emoji.value}
                            </button>
                        {/each}
                    </div>
                </section>
                <section aria-labelledby={`${pickerId}-custom-emojis-heading`}>
                    <h3 id={`${pickerId}-custom-emojis-heading`} class="mb-1 px-1 text-xs font-medium text-surface-600-400">Custom Emoji</h3>
                    <p class="px-1 py-2 text-sm text-surface-600-400">Noch keine Custom Emojis verfügbar.</p>
                </section>
            </div>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>