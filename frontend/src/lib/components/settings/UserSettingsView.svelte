<script lang="ts">
    import { authClient } from "$lib/auth-client";
    import { page } from "$app/state";
    import { THEMES, THEME_MODES, themeManager } from "$lib/settings/theme.svelte";
    import UserRound from "@lucide/svelte/icons/user-round";
    import Palette from "@lucide/svelte/icons/palette";
    import Sun from "@lucide/svelte/icons/sun";
    import Moon from "@lucide/svelte/icons/moon";
    import Monitor from "@lucide/svelte/icons/monitor";
    import Bell from "@lucide/svelte/icons/bell";
    import Users from "@lucide/svelte/icons/users";
    import Smile from "@lucide/svelte/icons/smile";
    import { api } from "$lib/api";
    import { Popover } from '@skeletonlabs/skeleton-svelte';
    import NotificationSettings from "./NotificationSettings.svelte";
    import { getCustomEmojis, refreshCustomEmojis } from "$lib/custom-emoji-catalog.svelte";

    const user = $derived(page.data.user ?? null);
    type SettingsSection = "profile" | "appearance" | "notifications";
    const sections: { id: SettingsSection; label: string; icon: typeof UserRound }[] = [
        { id: "profile", label: "Profil", icon: UserRound },
        { id: "appearance", label: "Darstellung", icon: Palette },
        { id: "notifications", label: "Benachrichtigungen", icon: Bell },
    ];
    type AdminUser = { id: string; name: string; email: string; image: string | null };
    type AdminSection = "users" | "custom-emojis";
    let activeSection = $state<SettingsSection | AdminSection>("profile");
    let adminUsers = $state<AdminUser[]>([]);
    let adminUsersLoading = $state(false);
    let adminUsersLoaded = $state(false);
    let adminUsersError = $state(false);
    let customEmojiName = $state('');
    let customEmojiFile = $state<File | null>(null);
    let customEmojiBusy = $state(false);
    let customEmojiError = $state<string | null>(null);
    let customEmojiSuccess = $state<string | null>(null);
    const customEmojis = $derived(getCustomEmojis());

    function apiErrorMessage(response: unknown, fallback: string): string | null {
        const requestError: unknown = typeof response === 'object' && response !== null
            ? Reflect.get(response, 'error')
            : undefined;
        if (requestError === undefined || requestError === null) return null;
        const errorValue: unknown = typeof requestError === 'object' && requestError !== null
            ? Reflect.get(requestError, 'value')
            : undefined;
        const errorBody: unknown = typeof errorValue === 'object' && errorValue !== null
            ? Reflect.get(errorValue, 'error')
            : undefined;
        const message: unknown = typeof errorBody === 'object' && errorBody !== null
            ? Reflect.get(errorBody, 'message')
            : undefined;
        return typeof message === 'string' ? message : fallback;
    }

    async function loadAdminUsers() {
        if (adminUsersLoaded || adminUsersLoading) return;
        adminUsersLoading = true;
        adminUsersError = false;
        try {
            const response = await api.users.get();
            if (response.error || !response.data) throw new Error("Benutzer konnten nicht geladen werden.");
            adminUsers = response.data;
            adminUsersLoaded = true;
        } catch {
            adminUsersError = true;
        } finally {
            adminUsersLoading = false;
        }
    }

    async function selectSection(section: SettingsSection | AdminSection) {
        activeSection = section;
        if (section === "users") void loadAdminUsers();
        if (section === "custom-emojis") await refreshCustomEmojis();
    }

    async function createCustomEmoji(event: SubmitEvent) {
        event.preventDefault();
        if (!customEmojiFile || customEmojiBusy) return;
        customEmojiBusy = true;
        customEmojiError = null;
        customEmojiSuccess = null;
        try {
            const response = await api['custom-emojis'].post({
                name: customEmojiName,
                file: customEmojiFile,
            });
            const errorMessage = apiErrorMessage(response, 'Das Emoji konnte nicht hochgeladen werden.');
            if (errorMessage) throw new Error(errorMessage);
            customEmojiName = '';
            customEmojiFile = null;
            const fileInput = document.getElementById('custom-emoji-file') as HTMLInputElement | null;
            if (fileInput) fileInput.value = '';
            customEmojiSuccess = 'Custom Emoji wurde hinzugefügt.';
            await refreshCustomEmojis();
        } catch (error) {
            customEmojiError = error instanceof Error ? error.message : 'Das Emoji konnte nicht hochgeladen werden.';
        } finally {
            customEmojiBusy = false;
        }
    }

    async function deleteCustomEmoji(name: string) {
        if (customEmojiBusy) return;
        customEmojiBusy = true;
        customEmojiError = null;
        customEmojiSuccess = null;
        try {
            const response = await api['custom-emojis']({ name }).delete();
            const errorMessage = apiErrorMessage(response, 'Das Emoji konnte nicht gelöscht werden.');
            if (errorMessage) throw new Error(errorMessage);
            customEmojiSuccess = `:${name}: wurde gelöscht.`;
            await refreshCustomEmojis();
        } catch (error) {
            customEmojiError = error instanceof Error ? error.message : 'Das Emoji konnte nicht gelöscht werden.';
        } finally {
            customEmojiBusy = false;
        }
    }

    async function logout() {
        await authClient.signOut();
        window.location.href = "/login";
    }
</script>

<div class="flex h-[min(70vh,36rem)] min-h-0 flex-col gap-3 md:flex-row md:gap-4">
    <nav aria-label="Einstellungen" class="flex w-full shrink-0 gap-1 overflow-x-auto pb-2 md:w-48 md:flex-col md:overflow-x-visible md:pb-0">
        {#each sections as section (section.id)}
            <button
                type="button"
                aria-pressed={activeSection === section.id}
                class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors
                    {activeSection === section.id
                        ? 'bg-primary-500 text-primary-contrast-500'
                        : 'hover:bg-surface-100 hover:text-surface-contrast-100'}"
                onclick={() => selectSection(section.id)}
            >
                <section.icon class="h-4 w-4" />
                {section.label}
            </button>
        {/each}
        {#if user?.isAdmin}
            <div class="mx-1 my-1 h-8 w-px shrink-0 bg-surface-300-700 md:mx-0 md:my-2 md:h-px md:w-full"></div>
            <div class="flex shrink-0 gap-1 md:flex-col">
                <p class="shrink-0 self-center px-2 text-xs font-semibold uppercase tracking-wide text-surface-contrast-400-800 md:self-start md:px-3 md:pb-1">Administration</p>
                <button
                    type="button"
                    aria-pressed={activeSection === "users"}
                    class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors
                        {activeSection === "users"
                            ? 'bg-primary-500 text-primary-contrast-500'
                            : 'hover:bg-surface-100 hover:text-surface-contrast-100'}"
                    onclick={() => selectSection("users")}
                >
                    <Users class="h-4 w-4" />
                    Benutzer
                </button>
                <button
                    type="button"
                    aria-pressed={activeSection === "custom-emojis"}
                    class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors
                        {activeSection === "custom-emojis"
                            ? 'bg-primary-500 text-primary-contrast-500'
                            : 'hover:bg-surface-100 hover:text-surface-contrast-100'}"
                    onclick={() => void selectSection("custom-emojis")}
                >
                    <Smile class="h-4 w-4" />
                    Custom Emoji
                </button>
            </div>
        {/if}
    </nav>

    <div class="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
        {#if activeSection === "profile"}
            <div class="flex flex-col gap-6">
                <div class="flex items-center gap-4">
                    <img src={user?.image ?? "/default-avatar.png"} alt="Profilbild" class="h-16 w-16 rounded-full border-2 border-surface-200-800" />
                    <div>
                        <p class="flex flex-wrap items-center gap-2 font-bold">
                            {user?.name ?? "Benutzer"}
                        </p>
                        <p class="text-sm text-surface-contrast-400-800">{user?.email}</p>
                    </div>
                </div>
                <button type="button" class="btn preset-outlined-error" onclick={logout}>Abmelden</button>
                <p class="text-center text-xs text-surface-contrast-400-800">Version {__APP_VERSION__}</p>
            </div>
        {:else if activeSection === "appearance"}
            <div class="flex flex-col gap-6">
                <div>
                    <p class="font-semibold">Erscheinungsmodus</p>
                    <p class="text-sm text-surface-contrast-400-800">Helles, dunkles oder systemabhängiges Erscheinungsbild auswählen.</p>
                    <div class="mt-2 grid grid-cols-3 gap-1 rounded-md bg-surface-100-900 p-1">
                        {#each THEME_MODES as modeOption (modeOption.id)}
                            <button
                                class="flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors
                                    {themeManager.mode === modeOption.id ? 'bg-primary-500 text-primary-contrast-500' : 'hover:bg-surface-200-800'}"
                                onclick={() => themeManager.mode = modeOption.id}
                            >
                                {#if modeOption.id === "light"}<Sun class="h-4 w-4" />{:else if modeOption.id === "dark"}<Moon class="h-4 w-4" />{:else}<Monitor class="h-4 w-4" />{/if}
                                {modeOption.label}
                            </button>
                        {/each}
                    </div>
                </div>

                <div>
                    <p class="font-semibold">Farbschema</p>
                    <p class="text-sm text-surface-contrast-400-800">Farbschema der Anwendung auswählen.</p>
                    <div class="mt-2 grid grid-cols-3 gap-2">
                        {#each THEMES as themeOption (themeOption.id)}
                            <button
                                class="flex flex-col gap-1.5 rounded-md border p-2 text-left text-sm transition-colors
                                    {themeManager.theme === themeOption.id ? 'border-primary-500 ring-1 ring-primary-500' : 'border-surface-200-800 hover:border-surface-400-600'}"
                                onclick={() => themeManager.theme = themeOption.id}
                            >
                                <span data-theme={themeOption.id} class="flex h-8 overflow-hidden rounded">
                                    <span class="flex-1 bg-primary-500"></span>
                                    <span class="flex-1 bg-secondary-500"></span>
                                    <span class="flex-1 bg-surface-500"></span>
                                </span>
                                {themeOption.label}
                            </button>
                        {/each}
                    </div>
                </div>
            </div>
        {:else if activeSection === "notifications"}
            <NotificationSettings />
        {:else if activeSection === "custom-emojis"}
            <section aria-labelledby="admin-custom-emojis-heading" class="flex flex-col gap-4">
                <div>
                    <h2 id="admin-custom-emojis-heading" class="text-lg font-semibold">Custom Emoji</h2>
                    <p class="mt-1 text-sm text-surface-contrast-400-800">Emoji-Namen werden in Texten als <code>:name:</code> gespeichert.</p>
                </div>
                <form class="flex flex-col gap-3 rounded-xl border border-surface-300-700/50 p-3" onsubmit={createCustomEmoji}>
                    <label class="flex flex-col gap-1 text-sm">
                        <span class="font-medium">Name</span>
                        <input class="input w-full" bind:value={customEmojiName} maxlength="32" pattern="[a-z0-9][a-z0-9_-]*" placeholder="gnag_wave" required />
                        <span class="text-xs text-surface-contrast-400-800">Kleinbuchstaben, Zahlen, _ und -</span>
                    </label>
                    <label class="flex flex-col gap-1 text-sm">
                        <span class="font-medium">Bild</span>
                        <input id="custom-emoji-file" class="input w-full" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/apng" required onchange={(event) => customEmojiFile = event.currentTarget.files?.[0] ?? null} />
                        <span class="text-xs text-surface-contrast-400-800">PNG, JPEG, GIF, WebP, AVIF oder APNG; maximal 10 MB. Animation bleibt erhalten.</span>
                    </label>
                    <div class="flex justify-end">
                        <button class="btn preset-filled" type="submit" disabled={customEmojiBusy || !customEmojiFile}>{customEmojiBusy ? 'Wird gespeichert …' : 'Emoji hinzufügen'}</button>
                    </div>
                </form>
                {#if customEmojiError}<p class="text-sm text-error-700-300" role="alert">{customEmojiError}</p>{/if}
                {#if customEmojiSuccess}<p class="text-sm text-success-700-300" role="status">{customEmojiSuccess}</p>{/if}
                {#if customEmojis.length === 0}
                    <p class="text-sm text-surface-contrast-400-800">Noch keine Custom Emojis vorhanden.</p>
                {:else}
                    <ul class="flex flex-col divide-y divide-surface-300-700" aria-label="Custom Emoji">
                        {#each customEmojis as emoji (emoji.name)}
                            <li class="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                                <Popover positioning={{ placement: 'bottom-start', gutter: 8 }}>
                                    <Popover.Trigger
                                        type="button"
                                        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-surface-300-700/50 bg-surface-50-950 hover:bg-surface-200-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                                        aria-label={`Details zu :${emoji.name}: anzeigen`}
                                    >
                                        <img src={emoji.url} alt="" class="h-8 w-8 object-contain" />
                                    </Popover.Trigger>
                                    <Popover.Positioner>
                                        <Popover.Content class="z-50 w-64 rounded-xl border border-surface-300-700 bg-surface-50-950 p-4 shadow-lg">
                                            <Popover.Title class="font-semibold text-surface-950-50">:{emoji.name}:</Popover.Title>
                                            <Popover.Description class="mt-1 text-sm text-surface-600-400">
                                                Hochgeladen von {emoji.uploadedByName} am {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(emoji.createdAt))}
                                            </Popover.Description>
                                            <img src={emoji.url} alt={`Vorschau für :${emoji.name}:`} class="mx-auto mt-3 h-16 w-16 object-contain" />
                                        </Popover.Content>
                                    </Popover.Positioner>
                                </Popover>
                                <div class="min-w-32 flex-1">
                                    <code class="block truncate font-semibold">:{emoji.name}:</code>
                                    <span class="block text-sm text-surface-600-400">Uploader: {emoji.uploadedByName}</span>
                                    <time class="block text-sm text-surface-600-400" datetime={emoji.createdAt}>
                                        {new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(emoji.createdAt))}
                                    </time>
                                </div>
                                <button type="button" class="btn preset-outlined-error" disabled={customEmojiBusy} onclick={() => void deleteCustomEmoji(emoji.name)}>Löschen</button>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>
        {:else}
            <section aria-labelledby="admin-users-heading" class="flex flex-col gap-4">
                <div>
                    <h2 id="admin-users-heading" class="text-lg font-semibold">Benutzer</h2>
                </div>
                {#if adminUsersLoading}
                    <p role="status" class="text-sm text-surface-contrast-400-800">Benutzer werden geladen …</p>
                {:else if adminUsersError}
                    <div class="flex flex-wrap items-center gap-3" role="alert">
                        <p class="text-sm text-error-700-300">Die Benutzerliste konnte nicht geladen werden.</p>
                        <button type="button" class="btn preset-outlined" onclick={() => void loadAdminUsers()}>Erneut versuchen</button>
                    </div>
                {:else if adminUsers.length === 0}
                    <p class="text-sm text-surface-contrast-400-800">Es sind keine Benutzer vorhanden.</p>
                {:else}
                    <ul class="flex flex-col divide-y divide-surface-300-700" aria-label="Benutzerliste">
                        {#each adminUsers as adminUser (adminUser.id)}
                            <li class="flex min-w-0 items-center gap-3 py-3">
                                <img src={adminUser.image ?? "/default-avatar.png"} alt="" class="h-10 w-10 shrink-0 rounded-full object-cover" />
                                <div class="min-w-0">
                                    <p class="truncate font-medium">{adminUser.name}</p>
                                    <p class="truncate text-sm text-surface-contrast-400-800">{adminUser.email}</p>
                                </div>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </section>
        {/if}
    </div>
</div>
