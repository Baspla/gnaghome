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
    let hasWavyEffect = $state(false);
    const gateway = getGatewayManager();

    // --- Wavy Border Configuration ---
    let waveAmplitude = $state(3);       // Height of the wave peaks (px)
    let waveFrequency = $state(2);       // Number of waves per 100 pixels
    let waveSpeed = $state(40);          // Speed of wave movement
    let waveCornerRadius = $state(16);   // Matches tailwind rounded-2xl (16px)
    // ---------------------------------

    let boxWidth = $state(0);
    let boxHeight = $state(0);
    let time = $state(0);
    const clipId = `wavy-clip-${Math.random().toString(36).slice(2, 9)}`;

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

    // Run animation loop only when the popover is open AND the 1% effect hit
    $effect(() => {
        let frame: number;
        if (open && hasWavyEffect) {
            const loop = (t: number) => {
                time = t;
                frame = requestAnimationFrame(loop);
            };
            frame = requestAnimationFrame(loop);
        }
        return () => {
            if (frame) cancelAnimationFrame(frame);
        };
    });

    onMount(() => {
        // Evaluate on client mount to prevent SSR hydration mismatches 
        hasWavyEffect = Math.random() < 0.05;

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

    // Dynamically calculate the wavy shape (bypassed if the effect didn't trigger)
    let wavyPath = $derived.by(() => {
        if (!hasWavyEffect || !boxWidth || !boxHeight) return '';

        const amp = waveAmplitude;
        const r = waveCornerRadius;
        const inset = amp + 1.5; 
        const ew = boxWidth - 2 * inset;
        const eh = boxHeight - 2 * inset;

        if (ew <= 0 || eh <= 0) return '';

        const fade = Math.min(20, ew / 4, eh / 4); 
        const angularFreq = (Math.PI * 2 * waveFrequency) / 100;
        const offset = (time / 1000) * waveSpeed;
        const step = 4; 

        const getAmp = (pos: number, length: number) => {
            if (pos < fade) return amp * (pos / fade);
            if (length - pos < fade) return amp * ((length - pos) / fade);
            return amp;
        };

        const topLength = ew - 2 * r;
        const rightLength = eh - 2 * r;
        let d = '';

        for (let i = 0; i < topLength; i += step) {
            const x = inset + r + i;
            const y = inset - getAmp(i, topLength) * Math.sin((x + offset) * angularFreq);
            d += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
        }
        d += `L ${inset + r + topLength} ${inset} `;
        d += `A ${r} ${r} 0 0 1 ${boxWidth - inset} ${inset + r} `; 

        for (let i = 0; i < rightLength; i += step) {
            const y = inset + r + i;
            const x = boxWidth - inset + getAmp(i, rightLength) * Math.sin((y + offset) * angularFreq);
            d += `L ${x} ${y} `;
        }
        d += `L ${boxWidth - inset} ${inset + r + rightLength} `;
        d += `A ${r} ${r} 0 0 1 ${boxWidth - inset - r} ${boxHeight - inset} `; 

        for (let i = 0; i < topLength; i += step) {
            const x = boxWidth - inset - r - i;
            const y = boxHeight - inset + getAmp(i, topLength) * Math.sin((x - offset) * angularFreq);
            d += `L ${x} ${y} `;
        }
        d += `L ${inset + r} ${boxHeight - inset} `;
        d += `A ${r} ${r} 0 0 1 ${inset} ${boxHeight - inset - r} `; 

        for (let i = 0; i < rightLength; i += step) {
            const y = boxHeight - inset - r - i;
            const x = inset - getAmp(i, rightLength) * Math.sin((y - offset) * angularFreq);
            d += `L ${x} ${y} `;
        }
        d += `L ${inset} ${inset + r} `;
        d += `A ${r} ${r} 0 0 1 ${inset + r} ${inset} `; 

        d += 'Z';
        return d;
    });
</script>

<Popover.Root bind:open onOpenChange={(isOpen) => { if (isOpen) void refreshProfile(); }}>
    <Popover.Trigger
        type="button"
        aria-label={triggerType === 'avatar' ? `Profil von ${name} anzeigen` : undefined}
        class={triggerType === 'avatar'
            ? ['inline-flex cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500', className]
            : ['cursor-pointer text-primary-700-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500', className]}
    >
        {#if triggerType === 'avatar'}
            <ProfileAvatar {image} {name} {size} class={avatarClass} />
        {:else}
            {name}
        {/if}
    </Popover.Trigger>
    <Popover.Portal>
        <Popover.Content
            onCloseAutoFocus={(event) => event.preventDefault()}
            side="bottom"
            align="start"
            alignOffset={-40}
            sideOffset={8}
            aria-label={`Profil von ${name}`}
            class="z-50 flex w-64 flex-col items-stretch outline-none"
        >
            <div class="pointer-events-none relative z-10 flex items-start px-5">
                <ProfileAvatar {image} {name} size="h-20 w-20 text-3xl" class="" />
            </div>
            
            <!-- Structural wrapper dynamically swaps out CSS based on the 1% chance -->
            <div 
                class="relative -mt-10 min-h-24 px-5 pb-5 pt-12 text-surface-950-50 {hasWavyEffect ? 'drop-shadow-xl' : 'overflow-hidden rounded-2xl border border-surface-300-700/60 bg-surface-50-950 shadow-xl'}"
                bind:clientWidth={boxWidth}
                bind:clientHeight={boxHeight}
            >
                {#if hasWavyEffect}
                    <!-- SVG Background Layer (Only rendered if effect hit) -->
                    <svg class="pointer-events-none absolute inset-0 h-full w-full" style="z-index: -1;">
                        <defs>
                            <clipPath id={clipId}>
                                <path d={wavyPath} />
                            </clipPath>
                        </defs>
                        <path
                            d={wavyPath}
                            class="fill-surface-50-950 stroke-surface-300-700/60"
                            stroke-width="1.5"
                            stroke-linejoin="round"
                        />
                    </svg>

                    <!-- Top Gradient perfectly clipped to the wavy contour -->
                    <div class="pointer-events-none absolute inset-0" style="clip-path: url(#{clipId}); z-index: -1;">
                        <div
                            class="absolute inset-x-0 top-0 h-12 opacity-50"
                            style:background={`linear-gradient(to bottom, ${accentColor}, transparent)`}
                            aria-hidden="true"
                        ></div>
                    </div>
                {:else}
                    <!-- Standard CSS Gradient (99% fallback) -->
                    <div
                        class="pointer-events-none absolute inset-x-0 top-0 h-12 opacity-50"
                        style:background={`linear-gradient(to bottom, ${accentColor}, transparent)`}
                        aria-hidden="true"
                    ></div>
                {/if}

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