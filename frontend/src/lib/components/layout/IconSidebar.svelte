<script lang="ts">
    import IconSidebarElement from "./IconSidebarElement.svelte";
    import UserControlPanel from "./UserControlPanel.svelte";
    import House from "@lucide/svelte/icons/house";
    import Folder from "@lucide/svelte/icons/folder";
    import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
</script>

<aside
    class="order-last flex h-16 w-full shrink-0 items-center justify-around gap-2 border-t border-surface-300-700/30 bg-surface-100-900 p-2 md:order-first md:h-full md:w-16 md:flex-col md:justify-start md:gap-3 md:border-r md:border-t-0 md:p-3"
>
    <nav aria-label="Primary navigation" class="flex min-w-0 flex-1 items-center justify-around gap-2 md:flex-1 md:flex-col md:justify-start">
        <IconSidebarElement href="/" label="Home">
            <House class="h-5 w-5" />
        </IconSidebarElement>

        <IconSidebarElement href="/counter" label="Counter">
            <MousePointerClick class="h-5 w-5" />
        </IconSidebarElement>
    </nav>

    <UserControlPanel />
</aside>