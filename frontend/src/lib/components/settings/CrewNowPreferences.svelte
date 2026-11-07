<script lang="ts">
    import { onMount } from 'svelte';
    import { Label, RadioGroup, Switch } from 'bits-ui';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    const gateway = getGatewayManager();

    type Preferences = { mirrorFrontPreview: boolean; captureDelaySeconds: 1 | 2 | 3 | 5 };
    const defaults: Preferences = { mirrorFrontPreview: true, captureDelaySeconds: 1 };
    const delayOptions: { value: Preferences['captureDelaySeconds']; label: string }[] = [
        { value: 1, label: '1 Sekunde' },
        { value: 2, label: '2 Sekunden' },
        { value: 3, label: '3 Sekunden' },
        { value: 5, label: '5 Sekunden' },
    ];

    let preferences = $state<Preferences>({ ...defaults });
    let loading = $state(true);
    let saving = $state(false);
    let errorMessage = $state<string | null>(null);
    let successMessage = $state<string | null>(null);

    async function loadPreferences() {
        try {
            const response = await api.crewnow.preferences.get();
            if (response.error || !response.data) throw new Error('Einstellungen konnten nicht geladen werden.');
            preferences = response.data;
            errorMessage = null;
        } catch {
            errorMessage = 'CrewNow-Präferenzen konnten nicht geladen werden.';
        } finally {
            loading = false;
        }
    }

    async function savePreferences(next: Preferences) {
        const previous = preferences;
        preferences = next;
        saving = true;
        errorMessage = null;
        successMessage = null;
        try {
            const response = await api.crewnow.preferences.put(next);
            if (response.error || !response.data) throw new Error('Speichern fehlgeschlagen.');
            preferences = response.data;
            successMessage = 'CrewNow-Präferenzen gespeichert.';
        } catch {
            preferences = previous;
            errorMessage = 'CrewNow-Präferenzen konnten nicht gespeichert werden.';
        } finally {
            saving = false;
        }
    }

    onMount(() => {
        const unsubscribeEvent = gateway.onEvent((event) => {
            if (event.type === 'crewnow.preferences.changed') void loadPreferences();
        });
        const unsubscribeConnected = gateway.onConnected(() => void loadPreferences());
        void loadPreferences();
        return () => {
            unsubscribeEvent();
            unsubscribeConnected();
        };
    });
</script>

<section class="flex flex-col gap-5" aria-labelledby="crewnow-preferences-heading">
    <div>
        <h2 id="crewnow-preferences-heading" class="text-lg font-semibold">Crew Now</h2>
        <p class="mt-1 text-sm text-surface-contrast-400-800">Passe die Kamera-Vorschau und den Wechsel zwischen den Aufnahmen an.</p>
    </div>

    {#if loading}
        <p class="text-sm text-surface-contrast-400-800" role="status">CrewNow-Präferenzen werden geladen …</p>
    {:else}
        <div class="flex items-center justify-between gap-4 rounded-lg border border-surface-300-700 p-3">
            <div class="min-w-0">
                <Label.Root for="crewnow-mirror-preview" class="font-medium">Frontkamera-Vorschau spiegeln</Label.Root>
                <p class="mt-1 text-sm text-surface-contrast-400-800">Standardmäßig gespiegelt. Deaktiviere die Option für das bisherige, ungespiegelte Live-Bild. Das Foto bleibt immer unverändert.</p>
            </div>
            <Switch.Root
                id="crewnow-mirror-preview"
                checked={preferences.mirrorFrontPreview}
                disabled={saving}
                aria-label="Frontkamera-Vorschau spiegeln"
                onCheckedChange={(checked) => void savePreferences({ ...preferences, mirrorFrontPreview: checked })}
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary-500 data-[state=unchecked]:bg-surface-300-700"
            >
                <Switch.Thumb class="pointer-events-none block h-5 w-5 rounded-full bg-surface-50-950 shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5" />
            </Switch.Root>
        </div>

        <fieldset disabled={saving} class="flex flex-col gap-2 disabled:opacity-60">
            <legend class="font-medium">Verzögerung vor der zweiten Aufnahme</legend>
            <p class="text-sm text-surface-contrast-400-800">Nach dem Wechsel der Kamera warten. Ab 2 Sekunden wird ein Countdown angezeigt.</p>
            <RadioGroup.Root
                value={String(preferences.captureDelaySeconds)}
                disabled={saving}
                onValueChange={(value) => {
                    const delay = Number(value);
                    if (delay === 1 || delay === 2 || delay === 3 || delay === 5) {
                        void savePreferences({ ...preferences, captureDelaySeconds: delay });
                    }
                }}
                aria-label="Verzögerung vor der zweiten Aufnahme"
                class="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
                {#each delayOptions as option (option.value)}
                    <RadioGroup.Item
                        value={String(option.value)}
                        class="rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                            data-[state=checked]:border-primary-500 data-[state=checked]:bg-primary-500 data-[state=checked]:text-primary-contrast-500 data-[state=unchecked]:border-surface-300-700 data-[state=unchecked]:hover:bg-surface-100-900"
                    >
                        {option.label}
                    </RadioGroup.Item>
                {/each}
            </RadioGroup.Root>
        </fieldset>
    {/if}

    {#if errorMessage}<p class="text-sm text-error-700-300" role="alert">{errorMessage}</p>{/if}
    {#if successMessage}<p class="text-sm text-success-700-300" role="status">{successMessage}</p>{/if}
</section>