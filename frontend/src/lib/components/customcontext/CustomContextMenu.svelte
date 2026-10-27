<script lang="ts">
    import type { Snippet } from "svelte";
    import { ContextMenu, type WithoutChild } from "bits-ui";
    type Props = ContextMenu.RootProps & {
        contextMenuContent: Snippet;
        contentProps?: WithoutChild<ContextMenu.ContentProps>;
        triggerClass?: string;
        children: Snippet;
    };
    let {
        open = $bindable(false),
        children,
        contextMenuContent,
        contentProps,
        triggerClass = "",
        ...restProps
    }: Props = $props();
</script>

<ContextMenu.Root bind:open {...restProps}>
    <ContextMenu.Trigger class={triggerClass}>
        {@render children()}
    </ContextMenu.Trigger>
    <ContextMenu.Portal>
        <ContextMenu.Content
            {...contentProps}
            class="rounded-md bg-surface-100-900 border-surface-200-800 border p-1 flex flex-col gap-1 items-start"
        >
            {@render contextMenuContent()}
        </ContextMenu.Content>
    </ContextMenu.Portal>
</ContextMenu.Root>
