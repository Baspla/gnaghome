<script lang="ts">
    import { Button } from "bits-ui";
    import type { WithoutChildren } from "bits-ui";

    type Props = WithoutChildren<Button.RootProps> & {
        children: import("svelte").Snippet;
        variant?: "primary" | "outlined";
    };

    let {
        children,
        variant = "primary",
        class: className,
        ...restProps
    }: Props = $props();

    const classes = $derived([
        "btn",
        variant === "primary" ? "preset-filled" : "preset-outlined",
        className,
    ]);
</script>

<Button.Root class={classes} {...restProps}>
    {@render children()}
</Button.Root>