<script lang="ts">
  import type { Snippet } from "svelte";
  import { AlertDialog, type WithoutChild } from "bits-ui";

  type Props = AlertDialog.RootProps & {
    title: Snippet;
    description?: Snippet;
    cancelLabel?: string;
    actionLabel?: string;
    variant?: "error" | "primary";
    onAction?: () => void;
    contentProps?: WithoutChild<AlertDialog.ContentProps>;
  };

  let {
    open = $bindable(false),
    contentProps,
    title,
    description,
    children,
    cancelLabel = "Abbrechen",
    actionLabel = "Bestätigen",
    variant = "primary",
    onAction,
    ...restProps
  }: Props = $props();
</script>

<AlertDialog.Root bind:open {...restProps}>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
    <AlertDialog.Content
      {...contentProps}
      class="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full bg-surface-300-700 rounded-2xl max-w-md p-5"
    >
      <AlertDialog.Title
        class="flex w-full justify-start text-lg font-bold tracking-tight text-surface-contrast-300-700"
      >
        {@render title()}
      </AlertDialog.Title>
      {#if description}
        <AlertDialog.Description class="text-sm text-surface-contrast-400-800 mb-4">
          {@render description()}
        </AlertDialog.Description>
      {/if}
      {@render children?.()}
      <div class="flex w-full justify-end gap-2 mt-4">
        <AlertDialog.Cancel
          class="btn preset-outlined"
        >
          {cancelLabel}
        </AlertDialog.Cancel>
        <AlertDialog.Action
          onclick={onAction}
          class={variant === "error"
            ? "btn preset-filled-error-500"
            : "btn preset-filled"}
        >
          {actionLabel}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>