<script lang="ts">
	import { toaster } from '$lib/toaster';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	import './layout.css';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href="/favicon.svg" /></svelte:head>
{@render children()}

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast toast={toast}>
			<Toast.Message>
			<Toast.Title class="font-bold">{toast.title}</Toast.Title>
			<Toast.Description>{toast.description}</Toast.Description>
		</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>
