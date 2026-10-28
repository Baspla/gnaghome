<script lang="ts">
    import IconSidebarElement from "./IconSidebarElement.svelte";
    import UserControlPanel from "./UserControlPanel.svelte";
    import House from "@lucide/svelte/icons/house";
    import MousePointerClick from "@lucide/svelte/icons/mouse-pointer-click";
    import Camera from "@lucide/svelte/icons/camera";
    import BookOpen from "@lucide/svelte/icons/book-open";
    import ChartNoAxesCombined from "@lucide/svelte/icons/chart-no-axes-combined";
    import Gamepad2 from "@lucide/svelte/icons/gamepad-2";
    import CalendarDays from "@lucide/svelte/icons/calendar-days";
    import Star from "@lucide/svelte/icons/star";
</script>

<aside
    class="order-last flex h-16 w-full shrink-0 items-center gap-2 overflow-hidden border-t border-surface-300-700/30 bg-surface-100-900 p-2 md:order-first md:h-full md:w-16 md:flex-col md:gap-3 md:border-r md:border-t-0 md:p-3"
>
    <nav
        aria-label="Primary navigation"
        class="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:min-h-0 md:flex-col md:items-center md:gap-3 md:overflow-x-hidden md:overflow-y-auto md:overscroll-y-contain"
    >
        <IconSidebarElement href="/" label="Home">
            <House class="h-5 w-5" />
        </IconSidebarElement>

        <IconSidebarElement href="/counter" label="Counter">
            <MousePointerClick class="h-5 w-5" />
        </IconSidebarElement>

        <IconSidebarElement href="/crewnow" label="CrewNow" disabled>
            <Camera class="h-5 w-5" />
        </IconSidebarElement>

        <IconSidebarElement href="/archive" label="Archive" disabled>
            <BookOpen class="h-5 w-5" />
        </IconSidebarElement>

        <IconSidebarElement href="/stats" label="Stats" disabled>
            <ChartNoAxesCombined class="h-5 w-5" />
        </IconSidebarElement>

        <IconSidebarElement href="/games" label="Games" disabled>
            <Gamepad2 class="h-5 w-5" />
        </IconSidebarElement>

        <IconSidebarElement href="/calendar" label="Calendar" disabled>
            <CalendarDays class="h-5 w-5" />
        </IconSidebarElement>

        <IconSidebarElement href="/reviews" label="Reviews" disabled>
            <Star class="h-5 w-5" />
        </IconSidebarElement>
    </nav>

    <div class="shrink-0 md:mt-auto">
        <UserControlPanel />
    </div>
</aside>