<script lang="ts">
    import ProfileCardPopover from '$lib/components/ProfileCardPopover.svelte';

    type Props = {
        userId: string;
        name: string;
        image?: string | null;
        class?: string;
    };

    let { userId, name, image = null, class: className }: Props = $props();
</script>

<ProfileCardPopover {userId} {name} {image} triggerType="name" class={className} />