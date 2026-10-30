<script lang="ts">
    import { api } from '$lib/api';
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';

    type Person = { id: string; name: string; image: string | null };
    type Props = { selectedIds: string[]; initialSelectedUsers?: Person[]; onChange: (ids: string[]) => void };

    let { selectedIds, initialSelectedUsers = [], onChange }: Props = $props();
    let people = $state<Person[]>([]);
    let query = $state('');
    let loading = $state(false);
    let errorMessage = $state<string | null>(null);
    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    let currentQuery = '';

    const availablePeople = $derived.by(() => {
        const peopleById = new Map(initialSelectedUsers.map((person) => [person.id, person]));
        for (const person of people) peopleById.set(person.id, person);
        return [...peopleById.values()];
    });

    async function loadPeople(search: string) {
        loading = true;
        errorMessage = null;
        currentQuery = search;
        try {
            const response = await api.crewnow.users.get({ query: { q: search, limit: 20 } });
            if (response.error || !response.data) throw new Error('People request failed');
            if (currentQuery === search) people = response.data.items as Person[];
        } catch {
            errorMessage = 'Personen konnten nicht geladen werden. Bitte versuche es erneut.';
        } finally {
            if (currentQuery === search) loading = false;
        }
    }

    function toggle(personId: string) {
        onChange(selectedIds.includes(personId)
            ? selectedIds.filter((id) => id !== personId)
            : [...selectedIds, personId]);
    }

    $effect(() => {
        const search = query.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => void loadPeople(search), 200);
        return () => clearTimeout(searchTimer);
    });
</script>

<section class="space-y-3">
    <p class="text-sm text-surface-600-400">Markiere Freunde, die auf diesem CrewNow zu sehen sind.</p>
            <label class="block space-y-1">
                <span class="text-sm font-medium text-surface-800-200">Personen suchen</span>
                <input
                    type="search"
                    bind:value={query}
                    placeholder="Name eingeben …"
                    class="input w-full"
                    autocomplete="off"
                />
            </label>

            {#if selectedIds.length}
                <ul class="flex flex-wrap gap-2" aria-label="Ausgewählte Personen">
                    {#each selectedIds as id (id)}
                        {@const selectedPerson = availablePeople.find((person) => person.id === id)}
                        <li class="flex items-center gap-2 rounded-full bg-primary-100-900 px-2 py-1 text-sm text-primary-900-100">
                            {#if selectedPerson}
                                <ProfilePicture image={selectedPerson.image} name={selectedPerson.name} size="h-6 w-6 text-xs" />
                                <span>{selectedPerson.name}</span>
                            {:else}
                                <span>{id}</span>
                            {/if}
                            <button type="button" class="rounded-full px-1 hover:bg-primary-200-800" aria-label={`Markierung entfernen${selectedPerson ? `: ${selectedPerson.name}` : ''}`} onclick={() => toggle(id)}>×</button>
                        </li>
                    {/each}
                </ul>
            {/if}

            <div class="max-h-56 overflow-y-auto rounded-xl border border-surface-300-700/40 bg-surface-50-950">
                {#if loading}
                    <p class="p-3 text-sm text-surface-600-400" role="status">Personen werden geladen …</p>
                {:else if errorMessage}
                    <p class="p-3 text-sm text-error-700-300" role="alert">{errorMessage}</p>
                {:else if people.length === 0}
                    <p class="p-3 text-sm text-surface-600-400">Keine passenden Personen gefunden.</p>
                {:else}
                    <ul>
                        {#each people as person (person.id)}
                            <li>
                                <button
                                    type="button"
                                    aria-pressed={selectedIds.includes(person.id)}
                                    onclick={() => toggle(person.id)}
                                    class="flex w-full items-center gap-3 px-3 py-2 text-left text-surface-900-100 hover:bg-surface-200-800 aria-pressed:bg-primary-100-900"
                                >
                                    <ProfilePicture image={person.image} name={person.name} size="h-9 w-9" />
                                    <span class="min-w-0 flex-1 truncate">{person.name}</span>
                                    <span aria-hidden="true" class="text-sm text-primary-700-300">{selectedIds.includes(person.id) ? 'Markiert' : 'Markieren'}</span>
                                </button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
 </section>