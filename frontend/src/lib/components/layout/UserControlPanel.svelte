<script lang="ts">
    import { page } from "$app/state";
    import Settings from "@lucide/svelte/icons/settings";
    import { DropdownMenu } from "bits-ui";
    import UserSettingsView from "../settings/UserSettingsView.svelte";
    import CustomDialog from "../customdialog/CustomDialog.svelte";

    const user = $derived(page.data.user ?? null);
    let settingsOpen = $state(false);
</script>

<DropdownMenu.Root>
    <DropdownMenu.Trigger
        class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full outline-none transition hover:bg-surface-200-800 focus-visible:ring-2 focus-visible:ring-primary-500"
        aria-label={`Kontomenü für ${user?.name ?? "Benutzer"} öffnen`}
        title={user?.name ?? "User"}
    >
        <img src={user?.image ?? "/default-avatar.png"} alt="" class="h-9 w-9 rounded-full object-cover" />
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
        <DropdownMenu.Content
            class="z-50 min-w-48 rounded-lg border border-surface-300-700 bg-surface-50-950 p-1 shadow-lg"
            side="top"
            align="end"
            sideOffset={8}
        >
            <DropdownMenu.Item
                disabled
                class="truncate rounded-md px-3 py-2 text-sm font-semibold text-surface-950-50 data-disabled:opacity-100"
            >
                {user?.name ?? "User"}
            </DropdownMenu.Item>
            <DropdownMenu.Separator class="my-1 h-px bg-surface-300-700/50" />
            <DropdownMenu.Item
                class="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-surface-100-900"
                onSelect={() => settingsOpen = true}
            >
                <Settings class="h-4 w-4" />
                Einstellungen
            </DropdownMenu.Item>
        </DropdownMenu.Content>
    </DropdownMenu.Portal>
</DropdownMenu.Root>

<CustomDialog bind:open={settingsOpen} contentProps={{ interactOutsideBehavior: "close" }}>
    {#snippet title()}<p>Einstellungen</p>{/snippet}
    {#snippet description()}<p>Profil, Darstellung, Benachrichtigungen und Verwaltungseinstellungen verwalten.</p>{/snippet}
    <UserSettingsView />
</CustomDialog>