<script lang="ts">
    import { Button } from "bits-ui";
    import type { WithoutChildren } from "bits-ui";

    type Props = WithoutChildren<Button.RootProps> & {
        children: import("svelte").Snippet;
        variant?: "primary" | "outlined" | "error" | "outlined-error" | "unstyled";
    };

    let {
        children,
        variant = "primary",
        class: className,
        ...restProps
    }: Props = $props();

    const classes = $derived([
        "enabled:cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors",
        variant === "primary"
            ? "btn preset-filled enabled:hover:bg-primary-600-400"
            : variant === "outlined"
                ? "btn preset-outlined enabled:hover:bg-surface-200-800"
                : variant === "error"
                    ? "btn preset-filled-error-500 enabled:hover:bg-error-600-400"
                    : variant === "outlined-error"
                        ? "btn preset-outlined-error-500 enabled:hover:bg-error-200-800"
                        : "",
        className,
    ]);
</script>

<Button.Root class={classes} {...restProps}>
    {@render children()}
</Button.Root>