<script lang="ts">
    import ProfilePicture from '$lib/components/ProfilePicture.svelte';
    import Username from '$lib/components/Username.svelte';
    import { MessageSquareShare, SquarePen, Trash } from '@lucide/svelte';
    import PostImage from './PostImage.svelte';
    import { formatPostDate } from './post-date';

    type Person = { id: string; name: string; image: string | null };
    type Post = {
        id: string;
        author: Person;
        backImage: { id: string; url: string };
        frontImage: { id: string; url: string };
        caption: string | null;
        taggedUsers: Person[];
        createdAt: string;
        updatedAt: string;
        canEdit: boolean;
    };
    type Props = { post: Post; compact?: boolean; hideOpenButton?: boolean; onDelete?: (post: Post) => void };

    let { post, compact = true, hideOpenButton = false, onDelete }: Props = $props();
    const formattedDate = $derived(formatPostDate(post.createdAt));
</script>

<article class="overflow-hidden rounded-2xl border border-surface-300-700/40 bg-surface-100-900 shadow-sm">
    <div class="flex items-center gap-3 px-4 py-4 sm:px-5">
        <ProfilePicture image={post.author.image} name={post.author.name} size="h-10 w-10" />
        <div class="min-w-0 flex-1">
            <Username userId={post.author.id} name={post.author.name} class="font-semibold text-surface-950-50" />
            {#if formattedDate}
                <time class="block text-xs text-surface-600-400" datetime={formattedDate.datetime}>{formattedDate.text}</time>
            {:else}
                <span class="block text-xs text-surface-600-400">Datum unbekannt</span>
            {/if}
        </div>
        {#if !hideOpenButton}
            <a href={`/crewnow/posts/${encodeURIComponent(post.id)}`} class="rounded-lg px-3 py-2 text-sm text-primary-700-300 hover:bg-surface-200-800"><MessageSquareShare class="h-4 w-4" /></a>
        {/if}
        {#if post.canEdit}
            <a class="rounded-lg px-3 py-2 text-sm text-primary-700-300 hover:bg-surface-200-800" href={`/crewnow/posts/${encodeURIComponent(post.id)}/edit`}><SquarePen class="h-4 w-4" /></a>
            <button type="button" class="rounded-lg px-3 py-2 text-sm text-error-700-300 hover:bg-error-100-900" onclick={() => onDelete?.(post)}><Trash class="h-4 w-4" /></button>
        {/if}
    </div>

    {#if compact}
        <PostImage backImageUrl={post.backImage.url} frontImageUrl={post.frontImage.url} caption={post.caption} />
    {:else}
        <PostImage backImageUrl={post.backImage.url} frontImageUrl={post.frontImage.url} caption={post.caption} />
    {/if}

    {#if post.taggedUsers.length > 0}
        <div class="px-4 pb-4 sm:px-5">
            <p class="text-xs font-medium uppercase tracking-wide text-surface-600-400">Auf dem Bild</p>
            <ul class="mt-2 flex flex-wrap gap-2">
                {#each post.taggedUsers as person (person.id)}
                    <li class="flex items-center gap-2 rounded-full bg-primary-100-900 py-1 pl-1 pr-3 text-sm text-primary-900-100">
                        <ProfilePicture image={person.image} name={person.name} size="h-7 w-7 text-xs" />
                        <Username userId={person.id} name={person.name} class="font-medium" />
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</article>