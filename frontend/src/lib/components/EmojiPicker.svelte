<script lang="ts">
    import { Label, Popover } from 'bits-ui';
    import { Search, Smile } from '@lucide/svelte';
    import { getCustomEmojis } from '$lib/custom-emoji-catalog.svelte';

    type Emoji = { value: string; label: string; keywords: string[] };
    type Props = { onSelect: (emoji: string) => void };

    let { onSelect }: Props = $props();
    let open = $state(false);
    let searchQuery = $state('');
    const pickerId = $props.id();
    const customEmojis = $derived(getCustomEmojis());

    const normalEmojis: Emoji[] = [
        { value: '🔥', label: 'Feuer', keywords: ['fire', 'flame', 'hot', 'heiß', 'brennen',"banger"] },
        { value: '♥️', label: 'Herz', keywords: ['heart', 'love', 'liebe', 'herz'] },
        { value: '😂', label: 'Lachen mit Tränen', keywords: ['laugh', 'tears', 'joy', 'lachen', 'tränen', 'freude'] },
        { value: '🥰', label: 'Verliebt', keywords: ['love', 'hearts', 'adore', 'liebe', 'verliebt', 'herzen'] },
        { value: '😭', label: 'Weinen', keywords: ['cry', 'sad', 'sobbing', 'weinen', 'traurig', 'schluchzen'] },
        { value: '👀', label: 'Augen', keywords: ['eyes', 'look', 'see', 'augen', 'schauen', 'sehen'] },
        { value: '🎉', label: 'Konfetti', keywords: ['party', 'celebration', 'tada', 'feier', 'geburtstag', 'konfetti'] },
        { value: '😅', label: 'Lächeln mit Schweiß', keywords: ['sweat', 'nervous', 'relief', 'schweiß', 'nervös', 'erleichtert'] },
        { value: '💀', label: 'Totenkopf', keywords: ['skull', 'dead', 'death', 'totenkopf', 'tot', 'sterben'] },
        { value: '👍', label: 'Daumen hoch', keywords: ['thumbs up', 'like', 'approve', 'daumen hoch', 'gut', 'zustimmen'] },
        { value: '👋', label: 'Winken', keywords: ['wave', 'hello', 'goodbye', 'winken', 'hallo', 'tschüss'] },
        { value: '😎', label: 'Cool', keywords: ['cool', 'sunglasses', 'awesome', 'sonnenbrille', 'lässig', 'klasse'] },
        { value: '🥵', label: 'Heiß', keywords: ['hot', 'heat', 'sweating', 'heiß', 'hitze', 'schwitzen'] },
        { value: '😵‍💫', label: 'Benommen', keywords: ['dizzy', 'confused', 'woozy', 'schwindelig', 'verwirrt', 'benommen'] },
        { value: '😡', label: 'Wütend', keywords: ['angry', 'mad', 'rage', 'wütend', 'sauer', 'zorn'] },
        { value: '🫣', label: 'Durch die Finger schauen', keywords: ['peeking', 'shy', 'scared', 'spicken', 'schüchtern', 'ängstlich'] },
        { value: '🤓', label: 'Nerd', keywords: ['nerd', 'geek', 'glasses', 'brille', 'streber'] },
        { value: '💩', label: 'Kackhaufen', keywords: ['poop', 'shit', 'poo', 'kacke', 'scheiße', 'haufen'] },
        { value: '🫪', label: 'Wahnsinn', keywords: ['closeup', 'lens', 'freaky', 'nah','distorted'] },
    ];
    const normalizedQuery = $derived(searchQuery.trim().toLowerCase());
    const filteredEmojis = $derived(normalEmojis.filter((emoji) =>
        emoji.value.includes(normalizedQuery)
            || emoji.label.toLowerCase().includes(normalizedQuery)
            || emoji.keywords.some((keyword) => keyword.toLowerCase().includes(normalizedQuery)),
    ));
    const filteredCustomEmojis = $derived(customEmojis.filter((emoji) =>
        emoji.name.toLowerCase().includes(normalizedQuery) || `:${emoji.name}:`.includes(normalizedQuery),
    ));

    function chooseEmoji(emoji: Emoji) {
        onSelect(emoji.value);
        searchQuery = '';
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
            <div class="flex max-h-[min(17rem,70dvh)] flex-col gap-3">
                <div class="relative block shrink-0">
                    <Label.Root for={`${pickerId}-search`} class="sr-only">Emojis suchen</Label.Root>
                    <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500-400" aria-hidden="true" />
                    <input
                        id={`${pickerId}-search`}
                        type="search"
                        bind:value={searchQuery}
                        placeholder="Emoji suchen …"
                        class="input w-full pl-9"
                        autocomplete="off"
                    />
                </div>
                <div id={`${pickerId}-emoji-results`} class="min-h-0 space-y-3 overflow-y-auto">
                    <section aria-labelledby={`${pickerId}-normal-emojis-heading`}>
                        <h3 id={`${pickerId}-normal-emojis-heading`} class="mb-1 px-1 text-xs font-medium text-surface-600-400">Normale Emojis</h3>
                        <div class="grid grid-cols-5 gap-1 sm:grid-cols-6">
                            {#if filteredEmojis.length > 0}
                                {#each filteredEmojis as emoji (emoji.value)}
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
                            {:else}
                                <p class="col-span-full px-1 py-2 text-sm text-surface-600-400">Keine passenden Emojis gefunden.</p>
                            {/if}
                        </div>
                    </section>
                    <section aria-labelledby={`${pickerId}-custom-emojis-heading`}>
                        <h3 id={`${pickerId}-custom-emojis-heading`} class="mb-1 px-1 text-xs font-medium text-surface-600-400">Custom Emoji</h3>
                        {#if filteredCustomEmojis.length === 0}
                            <p class="px-1 py-2 text-sm text-surface-600-400">{customEmojis.length === 0 ? 'Noch keine Custom Emojis verfügbar.' : 'Keine passenden Custom Emojis gefunden.'}</p>
                        {:else}
                            <div class="grid grid-cols-5 gap-1 sm:grid-cols-6">
                                {#each filteredCustomEmojis as emoji (emoji.name)}
                                    <button
                                        type="button"
                                        class="flex h-9 items-center justify-center rounded-lg text-xl leading-none hover:bg-surface-200-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:h-10 sm:text-2xl"
                                        aria-label={`${emoji.name} einfügen`}
                                        title={`:${emoji.name}:`}
                                        onclick={() => { onSelect(`:${emoji.name}:`); searchQuery = ''; open = false; }}
                                    >
                                        <img src={emoji.url} alt="" class="h-[1em] w-[1em] object-contain" />
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </section>
                </div>
            </div>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>