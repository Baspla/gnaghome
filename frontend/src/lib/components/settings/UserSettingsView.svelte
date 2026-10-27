<script lang="ts">
    import { authClient } from "$lib/auth-client";
    import { page } from "$app/state";
    import { THEMES, THEME_MODES, themeManager } from "$lib/settings/theme.svelte";
    import UserRound from "@lucide/svelte/icons/user-round";
    import Palette from "@lucide/svelte/icons/palette";
    import Sun from "@lucide/svelte/icons/sun";
    import Moon from "@lucide/svelte/icons/moon";
    import Monitor from "@lucide/svelte/icons/monitor";

    const user = $derived(page.data.user ?? null);
    type SettingsSection = "profile" | "appearance";
    const sections: { id: SettingsSection; label: string; icon: typeof UserRound }[] = [
        { id: "profile", label: "Profile", icon: UserRound },
        { id: "appearance", label: "Appearance", icon: Palette },
    ];
    let activeSection = $state<SettingsSection>("profile");

    async function logout() {
        await authClient.signOut();
        window.location.href = "/login";
    }
</script>

<div class="flex h-[28rem] gap-4">
    <nav class="flex w-48 shrink-0 flex-col gap-1">
        {#each sections as section (section.id)}
            <button
                class="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors
                    {activeSection === section.id
                        ? 'bg-primary-500 text-primary-contrast-500'
                        : 'hover:bg-surface-100 hover:text-surface-contrast-100'}"
                onclick={() => activeSection = section.id}
            >
                <section.icon class="h-4 w-4" />
                {section.label}
            </button>
        {/each}
    </nav>

    <div class="flex-1 overflow-y-auto pr-1">
        {#if activeSection === "profile"}
            <div class="flex flex-col gap-6">
                <div class="flex items-center gap-4">
                    <img src={user?.image ?? "/default-avatar.png"} alt="User avatar" class="h-16 w-16 rounded-full border-2 border-surface-200-800" />
                    <div>
                        <p class="font-bold">{user?.name ?? "User"}</p>
                        <p class="text-sm text-surface-contrast-400-800">{user?.email}</p>
                    </div>
                </div>
                <button type="button" class="btn preset-outlined-error" onclick={logout}>Log out</button>
            </div>
        {:else}
            <div class="flex flex-col gap-6">
                <div>
                    <p class="font-semibold">Color mode</p>
                    <p class="text-sm text-surface-contrast-400-800">Choose light, dark, or system mode.</p>
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
                    <p class="font-semibold">Color theme</p>
                    <p class="text-sm text-surface-contrast-400-800">Choose the application color theme.</p>
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
        {/if}
    </div>
</div>