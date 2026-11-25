<script lang="ts">
    import ProfileCardPopover from '$lib/components/ProfileCardPopover.svelte';

    type Props = {
        userId: string;
        name: string;
        image?: string | null;
        class?: string;
        /** Rendered directly after the name inside the trigger, e.g. a possessive "s". */
        suffix?: string;
    };

    let { userId, name, image = null, class: className, suffix = '' }: Props = $props();
</script>

<ProfileCardPopover {userId} {name} {image} triggerType="name" class={className} {suffix} />