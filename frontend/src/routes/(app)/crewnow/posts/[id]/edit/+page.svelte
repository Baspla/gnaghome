<script lang="ts">
    import { goto } from '$app/navigation';
    import type { PageProps } from './$types';
    import PostEditor from '$lib/components/crewnow/PostEditor.svelte';
    import { setPageTitle } from '$lib/utils';

    let { data }: PageProps = $props();
    const post = $derived(data.post as {
        id: string;
        author: { name: string };
        backImage: { url: string };
        frontImage: { url: string };
        caption: string | null;
        taggedUsers: Array<{ id: string; name: string; image: string | null }>;
    });
    setPageTitle('CrewNow bearbeiten');
</script>

<svelte:head>
    <title>CrewNow bearbeiten - Gnag Home</title>
</svelte:head>

<main class="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-4 py-7 sm:px-6">
    <header>
        <a href={`/crewnow/posts/${encodeURIComponent(post.id)}`} class="text-sm text-primary-700-300 hover:underline">← Zurück zum CrewNow</a>
        <h1 class="mt-3 text-2xl font-bold text-surface-950-50">CrewNow bearbeiten</h1>
        <p class="mt-1 text-sm text-surface-600-400">Bilder können nach dem Veröffentlichen nicht geändert werden.</p>
    </header>
    <PostEditor
        mode="edit"
        postId={post.id}
        backImageUrl={post.backImage.url}
        frontImageUrl={post.frontImage.url}
        initialCaption={post.caption}
        initialTaggedUsers={post.taggedUsers}
        onSaved={(postId) => void goto(`/crewnow/posts/${encodeURIComponent(postId)}`)}
    />
</main>