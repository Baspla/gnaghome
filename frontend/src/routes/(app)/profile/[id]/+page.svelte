<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageProps } from './$types';
    import { api } from '$lib/api';
    import { getGatewayManager } from '$lib/gateway/gateway-context.svelte';
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';

    let { data }: PageProps = $props();
    let refreshedProfile = $state<{ id: string; bio: string | null; accentColor: string } | null>(null);
    const profile = $derived(refreshedProfile?.id === data.profile.id
        ? { ...data.profile, ...refreshedProfile }
        : data.profile);
    const gateway = getGatewayManager();
    const joinedDate = $derived(new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'long',
        timeZone: 'Europe/Berlin',
    }).format(new Date(data.profile.createdAt)));

    async function refreshProfile() {
        try {
            const response = await api.users({ id: data.profile.id }).get();
            if (!response.error && response.data) {
                refreshedProfile = {
                    id: data.profile.id,
                    bio: response.data.bio ?? null,
                    accentColor: response.data.accentColor,
                };
            }
        } catch {
            // The server-rendered profile remains visible if the refresh fails.
        }
    }

    onMount(() => {
        const unsubscribeEvent = gateway.onEvent('user.profile.changed', (event) => {
            if (event.entityId === data.profile.id) void refreshProfile();
        });
        const unsubscribeConnected = gateway.onConnected(() => void refreshProfile());
        return () => {
            unsubscribeEvent();
            unsubscribeConnected();
        };
    });
</script>

<svelte:head>
    <title>{data.profile.name} - Gnaghome</title>
    <meta name="description" content={`Profil von ${profile.name}`} />
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center px-4 py-10">
    <section class="w-full overflow-hidden rounded-3xl border border-surface-300-700/60 bg-surface-100-900/30 text-center shadow-lg">
        <div
            class="h-32 opacity-75"
            style:background={`linear-gradient(to bottom, ${profile.accentColor}, transparent)`}
            aria-hidden="true"
        ></div>
        <div class="-mt-16 flex flex-col items-center gap-4 px-6 pb-8">
            <ProfilePicture
                userId={profile.id}
                image={profile.image}
                name={profile.name}
                size="h-32 w-32 text-4xl"
            />
            <h1 class="text-3xl font-bold text-surface-950-50">{profile.name}</h1>
            <div class="max-w-prose text-left w-full">
                <h2 class="text-xs font-semibold uppercase tracking-wide text-surface-600-400">Bio</h2>
                {#if profile.bio}
                    <p class="mt-1 whitespace-pre-wrap break-words text-surface-800-200">{profile.bio}</p>
                {:else}
                    <p class="mt-1 text-sm text-surface-600-400">-</p>
                {/if}
            </div>
            <p class="text-sm text-surface-600-400">Beigetreten am {joinedDate}</p>
        </div>
    </section>
</main>