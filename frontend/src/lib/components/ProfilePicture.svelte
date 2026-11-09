<script lang="ts">
    import ProfileAvatar from '$lib/components/ProfileAvatar.svelte';
    import ProfileCardPopover from '$lib/components/ProfileCardPopover.svelte';

    type Props = {
        userId?: string;
        image?: string | null;
        name?: string;
        size?: string;
        class?: string;
    };

    let {
        userId,
        image = null,
        name = "User",
        size = "h-10 w-10",
        class: className,
    }: Props = $props();
</script>

{#if userId}
    <ProfileCardPopover {userId} {image} {name} {size} avatarClass={className} />
{:else}
    <ProfileAvatar {image} {name} {size} class={className} />
{/if}