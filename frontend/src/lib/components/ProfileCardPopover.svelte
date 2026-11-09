<script lang="ts">
    import { Popover } from 'bits-ui';
    import { ArrowUpRight } from '@lucide/svelte';
    import ProfileAvatar from '$lib/components/ProfileAvatar.svelte';

    type Props = {
        userId: string;
        name: string;
        image?: string | null;
        triggerType?: 'avatar' | 'name';
        size?: string;
        class?: string;
        avatarClass?: string;
    };

    let {
        userId,
        name,
        image = null,
        triggerType = 'avatar',
        size = 'h-10 w-10',
        class: className,
        avatarClass,
    }: Props = $props();
</script>

<Popover.Root>
    <Popover.Trigger
        type="button"
        aria-label={triggerType === 'avatar' ? `Profil von ${name} anzeigen` : undefined}
        class={triggerType === 'avatar'
            ? ['inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500', className]
            : ['text-primary-700-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500', className]}
    >
        {#if triggerType === 'avatar'}
            <ProfileAvatar {image} {name} {size} class={avatarClass} />
        {:else}
            {name}
        {/if}
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            side="bottom"
            align="start"
            sideOffset={8}
            aria-label={`Profil von ${name}`}
            class="z-50 flex w-64 flex-col items-stretch outline-none"
        >
            <div class="pointer-events-none relative z-10 flex items-start px-5">
                <ProfileAvatar {image} {name} size="h-20 w-20 text-3xl" class="shadow-md" />
            </div>
            <div class="relative -mt-10 min-h-24 rounded-2xl border border-surface-300-700/60 bg-surface-50-950 px-5 pb-5 pt-12 text-surface-950-50 shadow-xl">
                <a
                    href={`/profile/${encodeURIComponent(userId)}`}
                    aria-label={`Profil von ${name} öffnen`}
                    title="Profil öffnen"
                    class="absolute right-2 top-2 inline-flex rounded-lg p-2 text-primary-700-300 transition-colors hover:bg-surface-200-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                    <ArrowUpRight class="h-4 w-4" aria-hidden="true" />
                </a>
                <p class="max-w-full truncate text-left text-lg font-semibold">{name}</p>
            </div>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>