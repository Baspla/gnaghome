<script lang="ts">
    type Props = {
        userId: string;
        name: string;
        class?: string;
    };

    let { userId, name, class: className }: Props = $props();
</script>

<a
    href={`/profile/${encodeURIComponent(userId)}`}
    class={["text-primary-700-300 underline-offset-2 hover:underline", className]}
>
    {name}
</a>