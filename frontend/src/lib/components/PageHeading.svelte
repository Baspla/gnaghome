<script lang="ts">
    type Props = {
        title: string;
        subtitle?: string | null;
    };

    let { title, subtitle = null }: Props = $props();
</script>

<div>
    <h1 class="text-2xl font-bold text-surface-950-50">{title}</h1>
    {#if subtitle}
        <p class="mt-1 text-sm text-surface-600-400">{subtitle}</p>
    {/if}
</div>