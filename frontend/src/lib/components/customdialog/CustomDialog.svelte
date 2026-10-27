<script lang="ts">
  import type { Snippet } from "svelte";
  import { Dialog, Separator, type WithoutChild } from "bits-ui";
  import { XIcon } from "@lucide/svelte";

  type Props = Dialog.RootProps & {
    title: Snippet;
    description: Snippet;
    contentProps?: WithoutChild<Dialog.ContentProps>;
  };

  let {
    open = $bindable(false),
    children,
    contentProps,
    title,
    description,
    ...restProps
  }: Props = $props();
</script>

<Dialog.Root bind:open {...restProps}>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
    <Dialog.Content
      {...contentProps}
      class="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full bg-surface-50-950 rounded-2xl max-w-3xl p-3"
    >
      <Dialog.Title
        class="flex w-full justify-start text-lg font-bold tracking-tight text-surface-contrast-300-700"
      >
        {@render title()}
      </Dialog.Title>
      <Dialog.Description class="text-sm text-surface-contrast-400-800 mb-4">
        {@render description()}
      </Dialog.Description>
      {@render children?.()}
      <Dialog.Close
        class="focus-visible:ring-foreground focus-visible:ring-offset-background focus-visible:outline-hidden absolute right-5 top-5 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98]"
      >
        <div>
          <XIcon class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </div>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
