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
    import { api } from "$lib/api";
    import NotificationSettings from "./NotificationSettings.svelte";

    const user = $derived(page.data.user ?? null);
    type SettingsSection = "profile" | "appearance" | "notifications";
    const sections: { id: SettingsSection; label: string; icon: typeof UserRound }[] = [
        { id: "profile", label: "Profil", icon: UserRound },
        { id: "appearance", label: "Darstellung", icon: Palette },
        { id: "notifications", label: "Benachrichtigungen", icon: Bell },
    ];
    type AdminUser = { id: string; name: string; email: string; image: string | null };
    let activeSection = $state<SettingsSection | "users">("profile");
    let adminUsers = $state<AdminUser[]>([]);
    let adminUsersLoading = $state(false);
    let adminUsersLoaded = $state(false);
    let adminUsersError = $state(false);

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

    function selectSection(section: SettingsSection | "users") {
        activeSection = section;
        if (section === "users") void loadAdminUsers();
    }

    async function logout() {
        await authClient.signOut();
        window.location.href = "/login";
    }
</script>

<div class="flex h-[min(70vh,36rem)] min-h-0 flex-col gap-3 md:flex-row md:gap-4">
    <nav aria-label="Einstellungen" class="flex w-full shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-x-visible">
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
