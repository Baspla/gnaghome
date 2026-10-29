<script lang="ts">
    import type { PageProps } from './$types';
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';

    let { data }: PageProps = $props();
    const joinedDate = $derived(new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'long',
        timeZone: 'Europe/Berlin',
    }).format(new Date(data.profile.createdAt)));
</script>

<svelte:head>
    <title>{data.profile.name} - Gnaghome</title>
    <meta name="description" content={`Profile for ${data.profile.name}`} />
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center gap-5 px-4 py-10 text-center">
    <ProfilePicture
        image={data.profile.image}
        name={data.profile.name}
        size="h-32 w-32 text-4xl"
        class="border-4 border-surface-300-700/40"
    />
    <h1 class="text-3xl font-bold text-surface-950-50">{data.profile.name}</h1>
    <p class="text-sm text-surface-600-400">Beigetreten am {joinedDate}</p>
</main>