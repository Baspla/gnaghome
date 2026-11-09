<script lang="ts">
    import { onMount } from 'svelte';
    import { Popover } from 'bits-ui';
    import { ArrowUpRight } from '@lucide/svelte';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import ProfileAvatar from '$lib/components/ProfileAvatar.svelte';
    import InlineText from '$lib/components/InlineText.svelte';

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

    let open = $state(false);
    let bio = $state<string | null>(null);
    let accentColor = $state('#6366f1');
    const gateway = getGatewayManager();

    async function refreshProfile() {
        try {
            const response = await api.users({ id: userId }).get();
            if (response.error || !response.data) return;
            bio = response.data.bio ?? null;
            accentColor = response.data.accentColor;
        } catch {
            // Keep the current popover content if the API is temporarily unavailable.
        }
    }

    onMount(() => {
        const unsubscribeEvent = gateway.onEvent('user.profile.changed', (event) => {
            if (open && event.entityId === userId) void refreshProfile();
        });
        const unsubscribeConnected = gateway.onConnected(() => {
            if (open) void refreshProfile();
        });
        return () => {
            unsubscribeEvent();
            unsubscribeConnected();
        };
    });
</script>

<Popover.Root bind:open onOpenChange={(isOpen) => { if (isOpen) void refreshProfile(); }}>
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
                <ProfileAvatar {image} {name} size="h-20 w-20 text-3xl" class="" />
            </div>
            <div class="relative -mt-10 min-h-24 overflow-hidden rounded-2xl border border-surface-300-700/60 bg-surface-50-950 px-5 pb-5 pt-12 text-surface-950-50 shadow-xl">
                <div
                    class="pointer-events-none absolute inset-x-0 top-0 h-12 opacity-50"
                    style:background={`linear-gradient(to bottom, ${accentColor}, transparent)`}
                    aria-hidden="true"
                ></div>
                <a
                    href={`/profile/${encodeURIComponent(userId)}`}
                    aria-label={`Profil von ${name} öffnen`}
                    title="Profil öffnen"
                    class="absolute right-2 top-2 inline-flex rounded-lg p-2 text-primary-700-300 transition-colors hover:bg-surface-100-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                    <ArrowUpRight class="h-4 w-4" aria-hidden="true" />
                </a>
                <p class="relative z-10 max-w-full truncate text-left text-lg font-semibold">{name}</p>
                <div class="relative z-10 mt-2 text-left">
                    <h2 class="text-xs font-semibold uppercase tracking-wide text-surface-600-400">Bio</h2>
                    {#if bio}
                        <p class="mt-1 line-clamp-3 whitespace-pre-wrap wrap-break-word text-sm text-surface-700-300"><InlineText text={bio} /></p>
                    {:else}
                        <p class="mt-1 text-sm text-surface-600-400">-</p>
                    {/if}
                </div>
            </div>
        </Popover.Content>
    </Popover.Portal>
</Popover.Root>