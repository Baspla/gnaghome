<script lang="ts">
    import type { Snippet } from "svelte";
    import { ContextMenu, type WithoutChild } from "bits-ui";
    type Props = ContextMenu.RootProps & {
        children: Snippet;
        disabled?: boolean;
    };
    let { children, disabled }: Props = $props();
</script>

<ContextMenu.Item {disabled} class="rounded-md btn btn-ghost">
    {@render children()}
</ContextMenu.Item>
