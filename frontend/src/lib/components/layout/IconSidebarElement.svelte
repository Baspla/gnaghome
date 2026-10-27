<script lang="ts">
    import type { Snippet } from "svelte";
    import { page } from "$app/state";

    let {
        href,
        label,
        disabled = false,
        children,
    }: {
        href: string;
        label: string;
        disabled?: boolean;
        children?: Snippet;
    } = $props();

    const fallbackLetter = $derived(href.charAt(1).toUpperCase());
    const isActive = $derived(page.url.pathname === href);
</script>

<a
    href={disabled ? undefined : href}
    aria-label={label}
    aria-disabled={disabled}
    aria-current={isActive ? "page" : undefined}
    title={label}
    class={[
        "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-all hover:rounded-xl",
        {
            "bg-primary-500 text-primary-contrast-500 rounded-xl": isActive,
            "hover:bg-primary-300 hover:text-primary-contrast-300": !isActive && !disabled,
            "pointer-events-none": disabled,
        },
    ]}
>
    {#if children}
        {@render children()}
    {:else}
        {fallbackLetter}
    {/if}
</a>