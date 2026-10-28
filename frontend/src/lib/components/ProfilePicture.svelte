<script lang="ts">
    type Props = {
        image?: string | null;
        name?: string;
        size?: string;
        class?: string;
    };

    let {
        image = null,
        name = "User",
        size = "h-10 w-10",
        class: className,
    }: Props = $props();

    let failedImage = $state<string | null>(null);
    const initials = $derived(name.trim().charAt(0).toUpperCase() || "?");
</script>

{#if image && failedImage !== image}
    <img
        src={image}
        alt={name}
        class={["shrink-0 rounded-full object-cover", size, className]}
        onerror={() => failedImage = image}
    />
{:else}
    <span
        role="img"
        aria-label={`${name} profile picture`}
        class={["inline-flex shrink-0 items-center justify-center rounded-full bg-primary-500 font-semibold text-primary-contrast-500", size, className]}
    >
        {initials}
    </span>
{/if}